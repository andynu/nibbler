# Turns a URL somebody pasted into a parsed feed.
#
# A feed URL parses straight away. An ordinary web page does not, so the page
# is searched for the feed it advertises in <link rel="alternate"> and that
# feed is fetched and parsed instead -- which is why callers subscribe to
# #feed_url rather than to the URL they passed in.
#
# One hop, never two: a discovered URL that turns out to be another page
# reports the parse failure rather than being searched again.
class FeedResolver
  class Result
    attr_reader :feed_url, :parse_result, :error

    def initialize(feed_url:, parse_result: nil, error: nil)
      @feed_url = feed_url
      @parse_result = parse_result
      @error = error
    end

    def success?
      @error.nil?
    end
  end

  NOT_A_FEED = "That page is not a feed and does not link to one".freeze
  UNREACHABLE = "Could not fetch that URL".freeze

  def initialize(url)
    @url = url
  end

  def resolve
    fetched = fetch(@url)
    return failure(@url, fetched.error.presence || UNREACHABLE) unless fetched.success?

    parsed = FeedParser.new(fetched.body, feed_url: @url).parse
    return Result.new(feed_url: @url, parse_result: parsed) if parsed.success?

    discovery = FeedLinkDiscovery.new(fetched.body, page_url: @url)
    linked = discovery.feed_url
    linked = nil if linked == @url

    return failure(@url, discovery.html? ? NOT_A_FEED : parsed.error) if linked.nil?

    resolve_linked(linked)
  end

  private

  def resolve_linked(url)
    fetched = fetch(url)
    unless fetched.success?
      return failure(url, "Could not fetch the feed linked by that page (#{url}): #{fetched.error.presence || UNREACHABLE}")
    end

    parsed = FeedParser.new(fetched.body, feed_url: url).parse
    return failure(url, "Could not parse the feed linked by that page (#{url}): #{parsed.error}") unless parsed.success?

    Result.new(feed_url: url, parse_result: parsed)
  end

  # A fresh Feed carrying only the URL, so the fetch sends no conditional
  # headers and the caller's saved feed (if any) is left alone.
  def fetch(url)
    FeedFetcher.for(Feed.new(feed_url: url)).fetch
  end

  def failure(url, message)
    Result.new(feed_url: url, error: message)
  end
end
