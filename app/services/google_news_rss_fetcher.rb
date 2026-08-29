# Fetches Google News RSS results for a query and parses them into
# StoryArticle-shaped hashes.
#
# Unlike feeds subscribed by users, story queries are not first-class "feeds"
# - they are ephemeral search endpoints keyed off an arbitrary query string.
# This service wraps the Google News RSS search URL and returns the parsed
# items without persisting anything; the caller decides what to do with them.
#
# @example
#   items = GoogleNewsRssFetcher.new("SEC crypto").fetch
#   items.first # => { url: "...", title: "...", snippet: "...", source: "...", published_at: Time }
#
# @see FetchStoryArticlesJob for the job that persists the parsed results
class GoogleNewsRssFetcher
  # Raised when the Google News endpoint returns a non-2xx response or the
  # connection fails entirely. Callers can rescue and continue with the next
  # query instead of aborting the whole job.
  class FetchError < StandardError; end

  RSS_BASE = "https://news.google.com/rss/search".freeze
  DEFAULT_TIMEOUT = 30
  USER_AGENT = "Nibbler/1.0 (+https://github.com/andyjakubowski/nibbler)".freeze

  Item = Data.define(:url, :title, :snippet, :source, :published_at)

  # @param query [String] the search query to send to Google News
  # @param hl    [String] the interface language (default "en-US")
  # @param gl    [String] the geographic edition (default "US")
  # @param ceid  [String] the combined country+language edition (default "US:en")
  def initialize(query, hl: "en-US", gl: "US", ceid: "US:en")
    @query = query
    @hl = hl
    @gl = gl
    @ceid = ceid
  end

  # Fetch the RSS feed and return a list of normalized items.
  #
  # @return [Array<Item>] one entry per <item> in the feed
  # @raise [FetchError] if the HTTP call fails or returns non-2xx
  def fetch
    response = make_request
    raise FetchError, "Google News responded #{response.status}" unless response.success?

    parse(response.body)
  rescue Faraday::TimeoutError
    raise FetchError, "Google News timed out"
  rescue Faraday::ConnectionFailed => e
    raise FetchError, "Google News connection failed: #{e.message}"
  end

  # The URL that will be fetched. Exposed for logging and debugging.
  # Uses %20 (rather than '+') for spaces to match how Faraday re-encodes the
  # URL when making the request, so logs and WebMock stubs line up.
  def url
    "#{RSS_BASE}?#{URI.encode_www_form(query_params).gsub('+', '%20')}"
  end

  private

  def query_params
    { q: @query, hl: @hl, gl: @gl, ceid: @ceid }
  end

  def make_request
    connection.get(RSS_BASE) do |req|
      req.params.update(query_params)
      req.headers["User-Agent"] = USER_AGENT
      req.headers["Accept"] = "application/rss+xml, application/xml, text/xml, */*"
    end
  end

  def parse(body)
    doc = Nokogiri::XML(body)
    doc.remove_namespaces!
    doc.xpath("//item").map { |item| normalize(item) }.compact
  end

  def normalize(item)
    link = item.at_xpath("link")&.text.to_s.strip
    return nil if link.empty?

    Item.new(
      url: link,
      title: item.at_xpath("title")&.text&.strip,
      snippet: item.at_xpath("description")&.text&.strip,
      source: item.at_xpath("source")&.text&.strip,
      published_at: parse_time(item.at_xpath("pubDate")&.text)
    )
  end

  def parse_time(raw)
    return nil if raw.blank?

    Time.parse(raw)
  rescue ArgumentError
    nil
  end

  # User-Agent and Accept are set per request in #make_request, so the
  # connection carries no default headers.
  def connection
    @connection ||= OutboundHttp.connection(
      timeout: DEFAULT_TIMEOUT,
      open_timeout: 10,
      redirect_limit: 5
    )
  end
end
