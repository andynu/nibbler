# Development helper: Caches feed responses to disk
# Prevents hammering live feeds during development
#
# Usage:
#   # Fetch and cache (will use cache if available)
#   result = CachedFeedFetcher.new(feed).fetch
#
#   # Force refresh
#   result = CachedFeedFetcher.new(feed).fetch(force: true)
#
#   # Clear all cache
#   CachedFeedFetcher.clear_cache!
#
class CachedFeedFetcher
  CACHE_DIR = Rails.root.join("tmp", "feed_cache")
  CACHE_EXPIRY = 1.hour

  def initialize(feed)
    @feed = feed
  end

  def fetch(force: false)
    ensure_cache_dir

    cache_file = cache_path
    metadata_file = metadata_path

    # Check cache
    if !force && cache_valid?(cache_file, metadata_file)
      return load_from_cache(cache_file, metadata_file)
    end

    # Fetch from network
    result = FeedFetcher.new(@feed).fetch

    # Cache successful responses
    if result.success?
      save_to_cache(cache_file, metadata_file, result)
    end

    result
  end

  def self.clear_cache!
    FileUtils.rm_rf(CACHE_DIR)
    puts "Feed cache cleared"
  end

  private

  def cache_key
    Digest::SHA256.hexdigest(@feed.feed_url)
  end

  def cache_path
    CACHE_DIR.join("#{cache_key}.xml")
  end

  def metadata_path
    CACHE_DIR.join("#{cache_key}.json")
  end

  def ensure_cache_dir
    FileUtils.mkdir_p(CACHE_DIR)
  end

  def cache_valid?(cache_file, metadata_file)
    return false unless File.exist?(cache_file) && File.exist?(metadata_file)

    metadata = JSON.parse(File.read(metadata_file))
    cached_at = Time.parse(metadata["cached_at"])
    cached_at > CACHE_EXPIRY.ago
  rescue JSON::ParserError, ArgumentError
    false
  end

  def load_from_cache(cache_file, metadata_file)
    metadata = JSON.parse(File.read(metadata_file))
    body = File.read(cache_file)

    Rails.logger.debug { "[CachedFeedFetcher] Using cached response for #{@feed.feed_url}" }

    FeedFetcher::FetchResult.new(
      status: :ok,
      body: body,
      etag: metadata["etag"],
      last_modified: metadata["last_modified"],
      content_type: metadata["content_type"]
    )
  end

  def save_to_cache(cache_file, metadata_file, result)
    File.write(cache_file, result.body)
    File.write(metadata_file, {
      cached_at: Time.current.iso8601,
      etag: result.etag,
      last_modified: result.last_modified,
      content_type: result.content_type,
      feed_url: @feed.feed_url
    }.to_json)

    Rails.logger.debug { "[CachedFeedFetcher] Cached response for #{@feed.feed_url}" }
  end
end
