# Feed fetcher that never opens a socket.
#
# Selected by FeedFetcher.for when OFFLINE_FEED_FETCH=1, which bin/e2e-server
# sets so the Playwright suite can exercise the refresh paths without reaching
# the public internet. Every fetch reports "not modified", so FeedUpdater takes
# its no-new-entries branch and the seeded dataset stays byte-for-byte stable
# across a run.
class OfflineFeedFetcher
  def initialize(feed)
    @feed = feed
  end

  def fetch(force: false)
    Rails.logger.debug { "[OfflineFeedFetcher] Skipping network fetch for #{@feed.feed_url}" }

    FeedFetcher::FetchResult.new(status: :not_modified)
  end
end
