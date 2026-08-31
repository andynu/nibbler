require "test_helper"
require "minitest/mock"

# The E2E fixture set has to be indistinguishable from ingested data in the ways
# the application actually reads it.
#
# E2eDataset writes Entry rows directly rather than through FeedUpdater, so it
# carries its own copy of every derived column the ingest path computes. Each
# such copy is a place the two can drift, and content_hash already did: the
# seeder wrote a SHA1 digest while FeedUpdater wrote SHA256 (ttrb-3pxi). Nothing
# noticed, because until EntrySummary landed no code compared a hash written by
# one path against a hash written by the other.
#
# EntrySummary#valid_for_content? does exactly that, so a summary generated
# against seeded data carried a hash that could never match the entry's, and the
# E2E suite could not exercise staleness at all: every summary read back stale.
class E2eDatasetTest < ActiveSupport::TestCase
  INGESTED_GUID = "e2e-dataset-test-ingested".freeze

  # Deliberately compares the two writers against each other rather than against
  # a named digest. What matters to EntrySummary is that they agree, not which
  # algorithm they agree on, and a test that pinned SHA256 in both places would
  # go on passing if one writer moved and someone updated its constant to match.
  #
  # The algorithm itself is pinned separately, once, at the ingest path:
  # test/services/feed_updater_test.rb asserts Digest::SHA256.hexdigest("").
  test "seeded entries carry the content_hash the ingest path would have written" do
    seeded = seeded_entry
    ingested = ingest(seeded.content)

    assert_equal seeded.content, ingested.content,
      "both paths must have hashed the same text for the hash comparison to mean anything"
    assert_equal seeded.content_hash, ingested.content_hash,
      "E2eDataset and FeedUpdater must derive content_hash the same way; " \
      "EntrySummary#valid_for_content? compares one against the other"
  end

  private

  # Builds the real fixture set and returns one of its entries. build! is the
  # half of reseed! that does not truncate, so this is safe inside the test
  # transaction; calling reseed! here would wipe the worker's database.
  def seeded_entry
    user = E2eDataset.new.build!

    Entry.joins(:user_entries).where(user_entries: { user_id: user.id }).order(:id).first
  end

  # Puts the given text through a real FeedUpdater, stubbing only the network,
  # and returns the Entry it stored.
  def ingest(content)
    feed = Feed.create!(
      user: users(:one),
      title: "Ingest",
      feed_url: "https://example.com/ingest.xml"
    )

    body = rss_with(content)
    fetcher = Object.new
    fetcher.define_singleton_method(:fetch) do
      FeedFetcher::FetchResult.new(status: :ok, body: body)
    end

    FeedFetcher.stub(:for, ->(*, **) { fetcher }) do
      FeedUpdater.new(feed).update
    end

    Entry.find_by!(guid: INGESTED_GUID)
  end

  # CDATA rather than escaped entities so the seeded markup reaches the parser
  # byte for byte; anything else would be comparing two different strings.
  def rss_with(content)
    <<~XML
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Ingest</title>
          <link>https://example.com</link>
          <item>
            <title>Ingested article</title>
            <link>https://example.com/ingested</link>
            <guid>#{INGESTED_GUID}</guid>
            <description><![CDATA[#{content}]]></description>
          </item>
        </channel>
      </rss>
    XML
  end
end
