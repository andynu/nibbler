# Finds the feeds an HTML page advertises in <link rel="alternate">.
#
# Whether a body is a page or a feed is decided by the body itself, never by
# Content-Type: a sitemap served as application/rss+xml is neither, and a page
# served as text/xml is still a page.
class FeedLinkDiscovery
  # The two types a reader can actually parse. A page's other alternates --
  # hreflang variants, alternate stylesheets, JSON feeds -- are not feeds
  # Feedjira can read, so they are left alone.
  FEED_TYPES = [
    "application/rss+xml",
    "application/atom+xml"
  ].freeze

  # Enough of the head to reach the markup that names the document. Leading
  # whitespace, a BOM and a comment or two sit in front of it.
  HTML_SNIFF_BYTES = 2048

  HTML_MARKER = /<!doctype\s+html|<html[\s>]/i

  def initialize(body, page_url:)
    @body = body.to_s
    @page_url = page_url
  end

  # The feed to subscribe to, or nil. A page linking several is taken at its
  # first, which is the one it presents as its main feed.
  def feed_url
    feed_urls.first
  end

  # Every linked feed, in document order.
  def feed_urls
    return [] unless html?

    @feed_urls ||= Nokogiri::HTML(@body).css("link").filter_map { |link| feed_href(link) }.uniq
  rescue StandardError
    []
  end

  def html?
    @body[0, HTML_SNIFF_BYTES].match?(HTML_MARKER)
  end

  private

  def feed_href(link)
    return nil unless alternate?(link["rel"])
    return nil unless FEED_TYPES.include?(media_type(link["type"]))

    absolute(link["href"])
  end

  def alternate?(rel)
    rel.to_s.downcase.split(/\s+/).include?("alternate")
  end

  def media_type(type)
    type.to_s.split(";").first.to_s.strip.downcase
  end

  def absolute(href)
    return nil if href.blank?

    url = URI.join(@page_url, href.strip).to_s
    url if url.match?(%r{\Ahttps?://}i)
  rescue URI::Error, ArgumentError
    nil
  end
end
