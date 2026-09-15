require "test_helper"
require "minitest/mock"

# Covers what a fetch does with an item it cannot store.
#
# The whole batch used to share one transaction, so a single unstorable item
# rolled back every sibling entry and the feed metadata with it, and the fetch
# was reported as a feed-level "Database error". A feed carrying one
# permanently bad item could never ingest anything. These tests pin the
# opposite: a mixed payload stores what it can and reports what it could not.
class FeedUpdaterTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  FEED_URL = "https://example.com/feed.xml".freeze

  setup do
    @user = users(:one)
    @feed = Feed.create!(user: @user, title: "Example", feed_url: FEED_URL)
  end

  # ==========================================
  # Per-entry isolation
  # ==========================================

  test "stores the good items in a payload that also contains an unstorable one" do
    result = update_with(mixed_payload)

    assert_equal :ok, result.status, "one bad item must not fail the whole fetch"
    assert_equal %w[good-1 good-2 headline-only], stored_guids
  end

  test "counts only the items it actually stored" do
    result = update_with(mixed_payload)

    assert_equal 3, result.new_entries_count
  end

  test "records the skipped item rather than swallowing it" do
    result = update_with(mixed_payload)

    assert_equal [ "untitled-1" ], result.skipped_entries.map(&:guid)
    assert_equal 1, result.skipped_entries_count
    assert_match(/Title can't be blank/, result.skipped_entries.first.error)
  end

  test "warns about the skipped item with the feed and guid" do
    logged = capture_warnings { update_with(mixed_payload) }

    assert(
      logged.any? { |line| line.include?("untitled-1") && line.include?("feed #{@feed.id}") },
      "expected a warning naming the skipped guid and its feed, got: #{logged.inspect}"
    )
  end

  test "commits the feed metadata even when an item is skipped" do
    update_with(mixed_payload)
    @feed.reload

    assert_equal "", @feed.last_error
    assert_not_nil @feed.last_successful_update
  end

  test "gives the user a user_entry for the items that stored" do
    update_with(mixed_payload)

    assert_equal 3, @feed.user_entries.count
  end

  # An entry that fails partway through must leave nothing behind. The savepoint
  # is what makes the skip clean rather than half-written.
  test "rolls back the failed item's own writes" do
    update_with(mixed_payload)

    assert_nil Entry.find_by(guid: "untitled-1")
    assert_equal 0, UserEntry.joins(:entry).where(entries: { guid: "untitled-1" }).count
  end

  # ==========================================
  # Headline-only items
  # ==========================================

  # 20 of the 50 items in the live Braintree, MA news flash feed carry a title
  # and a link and no body at all. That is a normal RSS shape, not a defect, so
  # a bodyless item has to store like any other.
  test "stores an item that has a title and a link but no body" do
    update_with(mixed_payload)

    entry = Entry.find_by(guid: "headline-only")
    assert_not_nil entry, "a headline-only item is a normal feed shape and must store"
    assert_equal "", entry.content
    assert_equal "Headline Only", entry.title
  end

  test "a feed of nothing but headline-only items ingests all of them" do
    result = update_with(headline_only_payload)

    assert_equal :ok, result.status
    assert_equal 3, result.new_entries_count
    assert_empty result.skipped_entries
  end

  # A bodyless entry still has to satisfy the NOT NULL column and hash to
  # something, so the rest of the pipeline treats it like any other row.
  #
  # Whether it is findable by full-text search is a separate question, settled
  # in ttrb-voe4: PostgreSQL generates tsvector_combined from title and content,
  # so a headline-only entry is indexed on its title alone.
  test "a bodyless entry stores an empty body rather than a null one" do
    update_with(mixed_payload)
    entry = Entry.find_by(guid: "headline-only")

    assert_not_nil entry.content
    assert_equal Digest::SHA256.hexdigest(""), entry.content_hash
  end

  # ==========================================
  # Unchanged happy path
  # ==========================================

  test "a payload with no bad items reports nothing skipped" do
    result = update_with(clean_payload)

    assert_equal :ok, result.status
    assert_equal 2, result.new_entries_count
    assert_empty result.skipped_entries
  end

  test "does not re-count entries it already has on a second fetch" do
    update_with(clean_payload)
    result = update_with(clean_payload)

    assert_equal 0, result.new_entries_count
    assert_equal 2, Entry.where(guid: %w[good-1 good-2]).count
  end

  # ==========================================
  # The failure path
  #
  # The error path used to write last_error and stop there. Nothing incremented
  # consecutive_failures outside the 429 branch and nothing moved next_poll_at,
  # so a feed whose domain had stopped resolving stayed permanently due and was
  # re-requested on every 5-minute cycle indefinitely. Every test below fails
  # against that version.
  # ==========================================

  test "a fetch error counts against the feed" do
    update_with_error("getaddrinfo: Name or service not known")

    assert_equal 1, @feed.reload.consecutive_failures
  end

  test "a fetch error records what went wrong" do
    update_with_error("Feed not found")

    assert_equal "Feed not found", @feed.reload.last_error
  end

  test "a fetch error pushes the next poll out instead of leaving the feed due" do
    @feed.update!(next_poll_at: 1.hour.ago)

    update_with_error("Connection timed out")

    assert @feed.reload.next_poll_at > Time.current,
      "the feed is still due after failing, so the scheduler will retry it on the next tick"
  end

  # The reported symptom, end to end: fail a feed, then ask the real scheduler
  # whether it is due again. This is the test that would have caught the bug.
  test "a failed feed is not enqueued again on the next scheduler tick" do
    Feed.where.not(id: @feed.id).delete_all
    update_with_error("getaddrinfo: Name or service not known")
    release_update_guard

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now
    end
  end

  test "repeated failures accumulate rather than resetting each cycle" do
    3.times { update_with_error("Connection failed") }

    assert_equal 3, @feed.reload.consecutive_failures
  end

  test "a feed that keeps failing eventually reads as broken" do
    Feed::BROKEN_AFTER_CONSECUTIVE_FAILURES.times { update_with_error("SSL verify failed") }

    assert @feed.reload.broken?
    assert_not_nil @feed.first_failed_at
  end

  test "a parse error is treated as a failure too, not just a transport error" do
    update_with("this is not xml at all")

    assert_equal 1, @feed.reload.consecutive_failures
    assert_not_equal "", @feed.last_error
  end

  # Failure backoff is our schedule, so it belongs in next_poll_at.
  # retry_after means a host told us to wait, and it gates the morning force
  # sweep and the manual refresh button. Writing failures there would make a
  # broken feed unreachable by both, and it would never be retried by hand.
  test "a fetch error does not set retry_after" do
    update_with_error("Feed not found")

    assert_nil @feed.reload.retry_after,
      "retry_after is the server's window; a failure of ours must not occupy it"
  end

  test "the morning force sweep still reaches a feed parked on failure backoff" do
    Feed.where.not(id: @feed.id).delete_all
    Feed::BROKEN_AFTER_CONSECUTIVE_FAILURES.times { update_with_error("dead domain") }
    release_update_guard

    assert_enqueued_with(job: UpdateFeedJob, args: [ @feed.id ]) do
      UpdateFeedsJob.perform_now(force: true)
    end
  end

  # ==========================================
  # Faults on nibbler's side
  #
  # The feed's server answered and its body parsed; storing it failed. That is
  # our fault, so it backs the feed off without counting against the feed.
  # ==========================================

  test "a database error while storing backs the feed off" do
    @feed.update!(next_poll_at: 1.hour.ago)

    result = update_with_storage_fault

    assert_equal :error, result.status
    assert_equal "Database error: deadlock detected", @feed.reload.last_error
    assert @feed.next_poll_at > Time.current
  end

  test "a database error while storing does not start a streak on a healthy feed" do
    update_with_storage_fault

    assert_equal 0, @feed.reload.consecutive_failures
    assert_nil @feed.first_failed_at
  end

  test "a database error while storing leaves an existing streak and its start alone" do
    3.times { update_with_error("Server error (503)") }
    started = @feed.reload.first_failed_at

    update_with_storage_fault

    assert_equal 3, @feed.reload.consecutive_failures
    assert_equal started, @feed.first_failed_at
  end

  test "a database error that keeps happening backs off further each cycle" do
    freeze_time

    3.times { update_with_storage_fault }

    assert_equal Feed::BACKOFF_DELAYS[2].to_i, (@feed.reload.next_poll_at - Time.current).to_i
  end

  # ==========================================
  # Recovery
  # ==========================================

  test "a feed that starts working again clears its streak without anyone intervening" do
    3.times { update_with_error("Server error (503)") }
    assert_equal 3, @feed.reload.consecutive_failures

    update_with(clean_payload)

    assert_equal 0, @feed.reload.consecutive_failures
    assert_nil @feed.first_failed_at
    assert_equal "", @feed.last_error
    assert_not @feed.broken?
  end

  # A 304 is a successful poll, so it has to clear the streak as much as a 200
  # does. A feed recovering into "not modified" would otherwise stay broken.
  test "a not-modified response clears the streak too" do
    3.times { update_with_error("Server error (503)") }

    update_with_fetch_result(FeedFetcher::FetchResult.new(status: :not_modified))

    assert_equal 0, @feed.reload.consecutive_failures
    assert_nil @feed.first_failed_at
  end

  # ==========================================
  # A year of failing stops the checks
  # ==========================================

  test "a feed failing for a year is marked dead and no longer scheduled, even by the sweep" do
    Feed.where.not(id: @feed.id).delete_all
    update_with_error("getaddrinfo: Name or service not known")
    @feed.update!(first_failed_at: Feed::DEAD_AFTER_FAILING_FOR.ago - 1.day)

    update_with_error("getaddrinfo: Name or service not known")
    release_update_guard
    @feed.update!(next_poll_at: 1.minute.ago)

    assert @feed.reload.dead?
    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now
      UpdateFeedsJob.perform_now(force: true)
    end
  end

  test "a storage fault never marks a feed dead" do
    3.times { update_with_error("Server error (503)") }
    @feed.update!(first_failed_at: 2.years.ago)

    update_with_storage_fault

    assert_not @feed.reload.dead?
  end

  test "a dead feed that answers again comes back without anyone intervening" do
    @feed.update!(consecutive_failures: 60, last_error: "Feed not found", first_failed_at: 400.days.ago, dead_at: 3.days.ago)

    update_with(clean_payload)

    assert_not @feed.reload.dead?
  end

  # ==========================================
  # Republished items
  #
  # A feed that republishes an item under the same GUID with different text has
  # edited it. EntrySummary#stale?, EntryFullText#stale? and CachedAudio all key
  # off the stored body, so it has to follow the edit for any of them to notice.
  # ==========================================

  test "an edited republish replaces the stored body and its hash" do
    update_with(edition("first draft"))
    update_with(edition("corrected copy"))

    entry = Entry.find_by!(guid: "edited")
    assert_includes entry.content, "corrected copy"
    assert_equal Digest::SHA256.hexdigest(entry.content), entry.content_hash
  end

  test "an edit makes a summary of the earlier text stale" do
    update_with(edition("first draft"))
    summary = summarize(Entry.find_by!(guid: "edited"))
    assert_not summary.stale?, "precondition: the summary starts current"

    update_with(edition("corrected copy"))

    assert summary.reload.stale?
  end

  test "a republish with identical text is not an edit" do
    update_with(edition("first draft"))
    entry = Entry.find_by!(guid: "edited")
    entry.update!(cached_content: "<p>first draft, images cached</p>")
    summary = summarize(entry)

    travel 1.hour do
      update_with(edition("first draft"))
    end

    assert_not summary.reload.stale?
    assert_equal "<p>first draft, images cached</p>", entry.reload.cached_content
  end

  test "an edit is not a new article" do
    update_with(edition("first draft"))
    user_entry = @feed.user_entries.joins(:entry).find_by!(entries: { guid: "edited" })
    user_entry.update!(unread: false, marked: true, score: 5, note: "check the numbers")
    published = user_entry.entry.updated

    result = travel(1.hour) { update_with(edition("corrected copy")) }

    assert_equal 0, result.new_entries_count
    user_entry.reload
    assert_not user_entry.unread
    assert user_entry.marked
    assert_equal 5, user_entry.score
    assert_equal "check the numbers", user_entry.note
    assert_equal published, user_entry.entry.updated,
      "entries.updated drives Fresh and the published sort; an edit must not resurface the article"
  end

  test "an edit drops the image-rewritten copy of the earlier text" do
    update_with(edition("first draft"))
    entry = Entry.find_by!(guid: "edited")
    entry.update!(cached_content: "<p>first draft, images cached</p>")

    update_with(edition("corrected copy"))

    assert_nil entry.reload.cached_content
  end

  test "an edit on an image-caching feed queues the new body's images" do
    @feed.update!(cache_images: true)
    update_with(edition("first draft"))
    entry = Entry.find_by!(guid: "edited")

    assert_enqueued_with(job: CacheArticleImagesJob, args: [ entry.id ]) do
      update_with(edition("corrected copy"))
    end
  end

  test "a republish with no body keeps the body already stored" do
    update_with(edition("first draft"))
    update_with(rss(item(guid: "edited", title: "Edited")))

    assert_includes Entry.find_by!(guid: "edited").content, "first draft"
  end

  # Entries are shared by GUID, so two feeds can carry one item. If both could
  # write, a pair with different bodies would overwrite each other on every
  # fetch and every summary of the item would read stale.
  test "a second feed carrying the same item does not rewrite the text" do
    aggregator = Feed.create!(user: @user, title: "Aggregator", feed_url: "https://planet.example.com/feed.xml")
    update_with(edition("first draft"))

    update_with(edition("aggregator's trimmed copy"), feed: aggregator)

    assert_includes Entry.find_by!(guid: "edited").content, "first draft"
  end

  # A headline or byline corrected under the same GUID is an edit too. Search
  # reads the title, and the reading pane shows both.

  test "a corrected headline replaces the stored title" do
    update_with(rss(item(guid: "edited", title: "Quokkas Retrun To Rottnest")))
    update_with(rss(item(guid: "edited", title: "Quokkas Return To Rottnest")))

    assert_equal "Quokkas Return To Rottnest", Entry.find_by!(guid: "edited").title
  end

  test "search finds an edited article by its corrected headline, not its first one" do
    update_with(rss(item(guid: "edited", title: "Wombats Return To Rottnest")))
    update_with(rss(item(guid: "edited", title: "Quokkas Return To Rottnest")))

    entry = Entry.find_by!(guid: "edited")
    assert_includes Entry.search("quokkas"), entry
    assert_not_includes Entry.search("wombats"), entry
  end

  test "a headline edit is not a new article" do
    update_with(rss(item(guid: "edited", title: "Quokkas Retrun")))
    user_entry = @feed.user_entries.joins(:entry).find_by!(entries: { guid: "edited" })
    user_entry.update!(unread: false)
    published = user_entry.entry.updated

    result = travel(1.hour) { update_with(rss(item(guid: "edited", title: "Quokkas Return"))) }

    assert_equal 0, result.new_entries_count
    assert_not user_entry.reload.unread
    assert_equal published, user_entry.entry.updated
  end

  test "a headline edit keeps the image-rewritten copy of the body" do
    @feed.update!(cache_images: true)
    update_with(rss(item(guid: "edited", title: "Quokkas Retrun", body: "&lt;p&gt;text&lt;/p&gt;")))
    entry = Entry.find_by!(guid: "edited")
    entry.update!(cached_content: "<p>text, images cached</p>")

    assert_no_enqueued_jobs(only: CacheArticleImagesJob) do
      update_with(rss(item(guid: "edited", title: "Quokkas Return", body: "&lt;p&gt;text&lt;/p&gt;")))
    end

    assert_equal "Quokkas Return", entry.reload.title
    assert_equal "<p>text, images cached</p>", entry.cached_content
  end

  test "a republish with no headline keeps the stored title" do
    update_with(rss(item(guid: "edited", title: "Quokkas Return")))

    update_with(rss(item(guid: "edited", title: nil)))

    assert_equal "Quokkas Return", Entry.find_by!(guid: "edited").title
  end

  test "a republish with a blank headline keeps the stored title and skips nothing" do
    update_with(rss(item(guid: "edited", title: "Quokkas Return")))

    result = update_with(rss(item(guid: "edited", title: "   ")))

    assert_equal "Quokkas Return", Entry.find_by!(guid: "edited").title
    assert_empty result.skipped_entries
  end

  test "a changed author replaces the stored author" do
    update_with(rss(item(guid: "edited", title: "Edited", author: "Staff")))
    update_with(rss(item(guid: "edited", title: "Edited", author: "Jo Quokka")))

    assert_equal "Jo Quokka", Entry.find_by!(guid: "edited").author
  end

  test "a republish with no author keeps the stored author and skips nothing" do
    update_with(rss(item(guid: "edited", title: "Edited", author: "Jo Quokka")))

    result = update_with(rss(item(guid: "edited", title: "Edited")))

    assert_equal "Jo Quokka", Entry.find_by!(guid: "edited").author
    assert_empty result.skipped_entries
  end

  test "a second feed carrying the same item does not rewrite the headline or author" do
    aggregator = Feed.create!(user: @user, title: "Aggregator", feed_url: "https://planet.example.com/feed.xml")
    update_with(rss(item(guid: "edited", title: "Quokkas Return", author: "Jo Quokka")))

    update_with(rss(item(guid: "edited", title: "Planet: Quokkas Return", author: "Planet Editors")), feed: aggregator)

    entry = Entry.find_by!(guid: "edited")
    assert_equal "Quokkas Return", entry.title
    assert_equal "Jo Quokka", entry.author
  end

  # A replaced attachment is an edit as well. A feed gives an enclosure no
  # identity beyond its URL, so the stored set is compared and replaced whole.

  test "a replaced enclosure replaces the stored one" do
    update_with(podcast(item(guid: "edited", title: "Episode 12", enclosure: "https://example.com/ep12.mp3")))
    update_with(podcast(item(guid: "edited", title: "Episode 12", enclosure: "https://example.com/ep12-fixed.mp3")))

    assert_equal [ "https://example.com/ep12-fixed.mp3" ], Entry.find_by!(guid: "edited").enclosures.pluck(:content_url)
  end

  test "a republish with the same enclosure does not rewrite it" do
    update_with(podcast(item(guid: "edited", title: "Episode 12", enclosure: "https://example.com/ep12.mp3")))
    stored = Entry.find_by!(guid: "edited").enclosures.pluck(:id)

    update_with(podcast(item(guid: "edited", title: "Episode 12", enclosure: "https://example.com/ep12.mp3")))

    assert_equal stored, Entry.find_by!(guid: "edited").enclosures.pluck(:id)
  end

  test "a republish with no enclosure keeps the stored one" do
    update_with(podcast(item(guid: "edited", title: "Episode 12", enclosure: "https://example.com/ep12.mp3")))
    update_with(podcast(item(guid: "edited", title: "Episode 12")))

    assert_equal [ "https://example.com/ep12.mp3" ], Entry.find_by!(guid: "edited").enclosures.pluck(:content_url)
  end

  test "a second feed carrying the same item does not replace the enclosure" do
    aggregator = Feed.create!(user: @user, title: "Aggregator", feed_url: "https://planet.example.com/feed.xml")
    update_with(podcast(item(guid: "edited", title: "Episode 12", enclosure: "https://example.com/ep12.mp3")))

    update_with(
      podcast(item(guid: "edited", title: "Episode 12", enclosure: "https://planet.example.com/mirror/ep12.mp3")),
      feed: aggregator
    )

    assert_equal [ "https://example.com/ep12.mp3" ], Entry.find_by!(guid: "edited").enclosures.pluck(:content_url)
  end

  private

  def edition(text)
    rss(item(guid: "edited", title: "Edited", body: "&lt;p&gt;#{text}&lt;/p&gt;"))
  end

  def summarize(entry)
    EntrySummary.create!(
      entry: entry,
      summary: "A paragraph about the article.",
      content_hash: entry.content_hash,
      readable_content_hash: EntrySummary.readable_content_hash_for(entry),
      model: "gemma4:e4b",
      generated_at: Time.current
    )
  end

  # FeedUpdater#update stamps last_update_started, and both the scheduler's
  # not_updating scope and its force mode skip a feed for the two minutes that
  # follow. Clearing it stands in for that time passing. Without this the
  # scheduler assertions above would pass on the mid-update guard alone and say
  # nothing at all about backoff.
  def release_update_guard
    @feed.update_column(:last_update_started, nil)
  end

  def stored_guids
    @feed.user_entries.joins(:entry).order("entries.guid").pluck("entries.guid")
  end

  # Runs a real FeedUpdater over a canned body, stubbing only the network.
  def update_with(body, feed: @feed)
    update_with_fetch_result(FeedFetcher::FetchResult.new(status: :ok, body: body), feed: feed)
  end

  # Same, but for a fetch that did not come back with a body. Nothing here
  # touches the network: the stub replaces FeedFetcher.for outright.
  def update_with_fetch_result(result, feed: @feed)
    fetcher = Object.new
    fetcher.define_singleton_method(:fetch) { result }

    FeedFetcher.stub(:for, ->(*, **) { fetcher }) do
      FeedUpdater.new(feed).update
    end
  end

  def update_with_error(message)
    update_with_fetch_result(FeedFetcher::FetchResult.new(status: :error, error: message))
  end

  # Runs a real update over a good body whose storage transaction deadlocks
  # just after resetting the feed's failure counts. The rollback leaves those
  # zeroed counts on @feed, which is the state a real storage fault hands to
  # the error path.
  def update_with_storage_fault
    reset = @feed.method(:reset_backoff!)
    deadlock = lambda do
      reset.call
      raise ActiveRecord::Deadlocked, "deadlock detected"
    end

    @feed.stub(:reset_backoff!, deadlock) do
      update_with(clean_payload)
    end
  end

  def capture_warnings
    logged = []
    logger = Rails.logger
    logger.stub(:warn, ->(message = nil, &block) { logged << (message || block&.call).to_s }) do
      yield
    end
    logged
  end

  # Feedjira reads <enclosure> with its iTunes parser, which it picks for a
  # channel that declares the iTunes namespace.
  def podcast(items)
    rss(items, namespaces: %( xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"))
  end

  def rss(items, namespaces: "")
    <<~XML
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"#{namespaces}>
        <channel>
          <title>Example Feed</title>
          <link>https://example.com</link>
          #{items}
        </channel>
      </rss>
    XML
  end

  # A nil title leaves the <title> element out altogether. An enclosure is read
  # only inside #podcast.
  def item(guid:, title:, body: nil, author: nil, enclosure: nil)
    headline = title.nil? ? "" : "<title>#{title}</title>"
    description = body ? "<description>#{body}</description>" : ""
    byline = author ? "<author>#{author}</author>" : ""
    attachment = enclosure ? %(<enclosure url="#{enclosure}" type="audio/mpeg" length="1000"/>) : ""

    <<~XML
      <item>
        #{headline}
        <link>https://example.com/#{guid}</link>
        <guid>#{guid}</guid>
        #{description}
        #{byline}
        #{attachment}
      </item>
    XML
  end

  # Deliberately mixes three shapes: storable items, an item with a
  # whitespace-only title that no validation will ever accept, and a
  # headline-only item with no body.
  def mixed_payload
    rss(
      item(guid: "good-1", title: "First Good", body: "&lt;p&gt;one&lt;/p&gt;") +
      item(guid: "untitled-1", title: "   ", body: "&lt;p&gt;two&lt;/p&gt;") +
      item(guid: "headline-only", title: "Headline Only") +
      item(guid: "good-2", title: "Second Good", body: "&lt;p&gt;three&lt;/p&gt;")
    )
  end

  def headline_only_payload
    rss(
      item(guid: "flash-1", title: "Parking Ticket Appeal") +
      item(guid: "flash-2", title: "Bulk Item Pickup") +
      item(guid: "flash-3", title: "Health Fee Schedule")
    )
  end

  def clean_payload
    rss(
      item(guid: "good-1", title: "First Good", body: "&lt;p&gt;one&lt;/p&gt;") +
      item(guid: "good-2", title: "Second Good", body: "&lt;p&gt;three&lt;/p&gt;")
    )
  end
end
