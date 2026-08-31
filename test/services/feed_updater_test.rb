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
  # handle_error used to write last_error and stop there. Nothing incremented
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

  private

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
  def update_with(body)
    update_with_fetch_result(FeedFetcher::FetchResult.new(status: :ok, body: body))
  end

  # Same, but for a fetch that did not come back with a body. Nothing here
  # touches the network: the stub replaces FeedFetcher.for outright.
  def update_with_fetch_result(result)
    fetcher = Object.new
    fetcher.define_singleton_method(:fetch) { result }

    FeedFetcher.stub(:for, ->(*, **) { fetcher }) do
      FeedUpdater.new(@feed).update
    end
  end

  def update_with_error(message)
    update_with_fetch_result(FeedFetcher::FetchResult.new(status: :error, error: message))
  end

  def capture_warnings
    logged = []
    logger = Rails.logger
    logger.stub(:warn, ->(message = nil, &block) { logged << (message || block&.call).to_s }) do
      yield
    end
    logged
  end

  def rss(items)
    <<~XML
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Example Feed</title>
          <link>https://example.com</link>
          #{items}
        </channel>
      </rss>
    XML
  end

  def item(guid:, title:, body: nil)
    description = body ? "<description>#{body}</description>" : ""

    <<~XML
      <item>
        <title>#{title}</title>
        <link>https://example.com/#{guid}</link>
        <guid>#{guid}</guid>
        #{description}
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
