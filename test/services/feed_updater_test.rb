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
    assert_equal %w[good-1 good-2], stored_guids
  end

  test "counts only the items it actually stored" do
    result = update_with(mixed_payload)

    assert_equal 2, result.new_entries_count
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

    assert_equal 2, @feed.user_entries.count
  end

  # An entry that fails partway through must leave nothing behind. The savepoint
  # is what makes the skip clean rather than half-written.
  test "rolls back the failed item's own writes" do
    update_with(mixed_payload)

    assert_nil Entry.find_by(guid: "untitled-1")
    assert_equal 0, UserEntry.joins(:entry).where(entries: { guid: "untitled-1" }).count
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

  private

  def stored_guids
    @feed.user_entries.joins(:entry).order("entries.guid").pluck("entries.guid")
  end

  # Runs a real FeedUpdater over a canned body, stubbing only the network.
  def update_with(body)
    fetcher = Object.new
    fetcher.define_singleton_method(:fetch) do
      FeedFetcher::FetchResult.new(status: :ok, body: body)
    end

    FeedFetcher.stub(:for, ->(*, **) { fetcher }) do
      FeedUpdater.new(@feed).update
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

  # The middle item has a whitespace-only title, which no validation will ever
  # accept. It stands in for any permanently unstorable item.
  def mixed_payload
    rss(
      item(guid: "good-1", title: "First Good", body: "&lt;p&gt;one&lt;/p&gt;") +
      item(guid: "untitled-1", title: "   ", body: "&lt;p&gt;two&lt;/p&gt;") +
      item(guid: "good-2", title: "Second Good", body: "&lt;p&gt;three&lt;/p&gt;")
    )
  end

  def clean_payload
    rss(
      item(guid: "good-1", title: "First Good", body: "&lt;p&gt;one&lt;/p&gt;") +
      item(guid: "good-2", title: "Second Good", body: "&lt;p&gt;three&lt;/p&gt;")
    )
  end
end
