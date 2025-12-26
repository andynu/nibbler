# Fetches feed content with proper HTTP caching
# Uses ETag and Last-Modified headers to avoid unnecessary downloads
class FeedFetcher
  class FetchResult
    attr_reader :status, :body, :etag, :last_modified, :content_type, :error

    def initialize(status:, body: nil, etag: nil, last_modified: nil, content_type: nil, error: nil)
      @status = status
      @body = body
      @etag = etag
      @last_modified = last_modified
      @content_type = content_type
      @error = error
    end

    def success?
      status == :ok
    end

    def not_modified?
      status == :not_modified
    end

    def error?
      status == :error
    end
  end

  USER_AGENT = "TTRB/1.0 (+https://github.com/yourname/ttrb)".freeze
  DEFAULT_TIMEOUT = 30

  def initialize(feed)
    @feed = feed
  end

  def fetch
    response = make_request
    handle_response(response)
  rescue Faraday::TimeoutError
    FetchResult.new(status: :error, error: "Connection timed out")
  rescue Faraday::ConnectionFailed => e
    FetchResult.new(status: :error, error: "Connection failed: #{e.message}")
  rescue StandardError => e
    FetchResult.new(status: :error, error: "Unexpected error: #{e.message}")
  end

  private

  def make_request
    connection.get(@feed.feed_url) do |req|
      req.headers["User-Agent"] = USER_AGENT
      req.headers["Accept"] = "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"

      # Conditional GET - only fetch if modified
      if @feed.last_modified.present?
        req.headers["If-Modified-Since"] = @feed.last_modified
      end

      # We store ETag in a new column - for now use last_modified field
      # TODO: Add etag column to feeds table
    end
  end

  def handle_response(response)
    case response.status
    when 200
      FetchResult.new(
        status: :ok,
        body: response.body,
        etag: response.headers["etag"],
        last_modified: response.headers["last-modified"],
        content_type: response.headers["content-type"]
      )
    when 304
      FetchResult.new(status: :not_modified)
    when 301, 302, 303, 307, 308
      # Redirects are followed by faraday-follow_redirects
      FetchResult.new(status: :error, error: "Unexpected redirect (should be followed)")
    when 401
      FetchResult.new(status: :error, error: "Authentication required")
    when 403
      FetchResult.new(status: :error, error: "Access forbidden")
    when 404
      FetchResult.new(status: :error, error: "Feed not found")
    when 410
      FetchResult.new(status: :error, error: "Feed gone (410)")
    when 429
      FetchResult.new(status: :error, error: "Rate limited - too many requests")
    when 500..599
      FetchResult.new(status: :error, error: "Server error (#{response.status})")
    else
      FetchResult.new(status: :error, error: "Unexpected status: #{response.status}")
    end
  end

  def connection
    @connection ||= Faraday.new do |f|
      f.options.timeout = DEFAULT_TIMEOUT
      f.options.open_timeout = 10

      # Follow redirects (up to 5)
      f.response :follow_redirects, limit: 5

      # Use net/http adapter
      f.adapter Faraday.default_adapter
    end
  end
end
