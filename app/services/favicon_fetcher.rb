# Fetches and processes favicons for feeds
# Tries multiple sources and calculates average color for UI theming
class FaviconFetcher
  class FetchResult
    attr_reader :status, :image_data, :content_type, :source, :error

    def initialize(status:, image_data: nil, content_type: nil, source: nil, error: nil)
      @status = status
      @image_data = image_data
      @content_type = content_type
      @source = source
      @error = error
    end

    def success?
      status == :ok
    end

    def error?
      status == :error
    end
  end

  USER_AGENT = "Nibbler/1.0 (+https://github.com/andyjakubowski/nibbler)".freeze
  DEFAULT_TIMEOUT = 15
  MAX_ICON_SIZE = 1.megabyte
  VALID_CONTENT_TYPES = %w[
    image/x-icon
    image/vnd.microsoft.icon
    image/png
    image/gif
    image/jpeg
    image/svg+xml
  ].freeze

  def initialize(feed)
    @feed = feed
  end

  def fetch
    return FetchResult.new(status: :error, error: "No site URL") if site_url.blank?

    # Try multiple sources in order of preference
    result = try_link_rel_icon ||
             try_apple_touch_icon ||
             try_favicon_ico

    result || FetchResult.new(status: :error, error: "No favicon found")
  rescue Faraday::TimeoutError
    FetchResult.new(status: :error, error: "Connection timed out")
  rescue Faraday::ConnectionFailed => e
    FetchResult.new(status: :error, error: "Connection failed: #{e.message}")
  rescue StandardError => e
    FetchResult.new(status: :error, error: "Unexpected error: #{e.message}")
  end

  private

  def site_url
    @site_url ||= begin
      url = @feed.site_url.presence || extract_base_url(@feed.feed_url)
      url = "https://#{url}" unless url&.start_with?("http")
      url
    end
  end

  def extract_base_url(url)
    return nil if url.blank?
    uri = URI.parse(url)
    "#{uri.scheme}://#{uri.host}"
  rescue URI::InvalidURIError
    nil
  end

  # Try to find favicon by parsing the HTML page for <link rel="icon"> tags
  def try_link_rel_icon
    response = connection.get(site_url) do |req|
      req.headers["User-Agent"] = USER_AGENT
      req.headers["Accept"] = "text/html"
    end

    return nil unless response.status == 200

    html = response.body
    icon_url = parse_favicon_link(html)
    return nil if icon_url.blank?

    fetch_icon(icon_url, source: "link_rel_icon")
  rescue StandardError
    nil
  end

  # Try Apple touch icon (often higher quality than favicon.ico)
  def try_apple_touch_icon
    icon_url = URI.join(site_url, "/apple-touch-icon.png").to_s
    fetch_icon(icon_url, source: "apple_touch_icon")
  rescue StandardError
    nil
  end

  # Try the standard /favicon.ico location
  def try_favicon_ico
    icon_url = URI.join(site_url, "/favicon.ico").to_s
    fetch_icon(icon_url, source: "favicon_ico")
  rescue StandardError
    nil
  end

  def fetch_icon(url, source:)
    response = connection.get(url) do |req|
      req.headers["User-Agent"] = USER_AGENT
      req.headers["Accept"] = VALID_CONTENT_TYPES.join(", ")
    end

    return nil unless response.status == 200
    return nil if response.body.blank?
    return nil if response.body.bytesize > MAX_ICON_SIZE

    content_type = response.headers["content-type"]&.split(";")&.first&.strip&.downcase
    return nil unless valid_content_type?(content_type)

    FetchResult.new(
      status: :ok,
      image_data: response.body,
      content_type: content_type,
      source: source
    )
  end

  def valid_content_type?(content_type)
    return true if content_type.nil? # Some servers don't set content-type
    VALID_CONTENT_TYPES.include?(content_type) || content_type.start_with?("image/")
  end

  def parse_favicon_link(html)
    doc = Nokogiri::HTML(html)

    # Try various link rel attributes for icons
    selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]'
    ]

    selectors.each do |selector|
      link = doc.at_css(selector)
      next unless link

      href = link["href"]
      next if href.blank?

      # Handle relative URLs
      return URI.join(site_url, href).to_s
    end

    nil
  rescue StandardError
    nil
  end

  def connection
    @connection ||= Faraday.new do |f|
      f.options.timeout = DEFAULT_TIMEOUT
      f.options.open_timeout = 10
      f.response :follow_redirects, limit: 5
      f.adapter Faraday.default_adapter
    end
  end
end
