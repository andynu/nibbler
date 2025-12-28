# Parses RSS/Atom feed content into normalized entry hashes
class FeedParser
  ParsedEntry = Data.define(
    :guid,
    :title,
    :link,
    :content,
    :author,
    :published,
    :updated,
    :categories,
    :enclosures
  )

  ParsedEnclosure = Data.define(
    :url,
    :type,
    :title,
    :length
  )

  class ParseResult
    attr_reader :title, :site_url, :entries, :error

    def initialize(title: nil, site_url: nil, entries: [], error: nil)
      @title = title
      @site_url = site_url
      @entries = entries
      @error = error
    end

    def success?
      @error.nil?
    end
  end

  def initialize(content, feed_url:)
    @content = content
    @feed_url = feed_url
  end

  def parse
    parsed = Feedjira.parse(@content)

    ParseResult.new(
      title: parsed.title,
      site_url: extract_site_url(parsed),
      entries: parsed.entries.map { |e| normalize_entry(e) }
    )
  rescue Feedjira::NoParserAvailable => e
    ParseResult.new(error: "Unable to parse feed: no suitable parser found")
  rescue StandardError => e
    ParseResult.new(error: "Parse error: #{e.message}")
  end

  private

  def extract_site_url(parsed)
    if parsed.respond_to?(:url) && parsed.url.present?
      parsed.url
    elsif parsed.respond_to?(:links) && parsed.links.present?
      # Atom feeds often have multiple links
      parsed.links.find { |l| l.is_a?(String) } || parsed.links.first
    else
      # Fall back to feed URL domain
      URI.parse(@feed_url).tap { |u| u.path = "/" }.to_s rescue @feed_url
    end
  end

  def normalize_entry(entry)
    ParsedEntry.new(
      guid: extract_guid(entry),
      title: entry.title&.strip || "(untitled)",
      link: extract_link(entry),
      content: extract_content(entry),
      author: entry.respond_to?(:author) ? entry.author : nil,
      published: entry.published,
      updated: entry.updated || entry.published,
      categories: extract_categories(entry),
      enclosures: extract_enclosures(entry)
    )
  end

  def extract_link(entry)
    # Try common URL methods - not all feed item types have all methods
    # Note: Feedjira sometimes puts guid in url field, so validate it looks like a URL
    if entry.respond_to?(:url) && entry.url.present? && url_like?(entry.url)
      return entry.url
    end
    if entry.respond_to?(:link) && entry.link.present? && url_like?(entry.link)
      return entry.link
    end
    # For podcasts, fall back to enclosure URL
    if entry.respond_to?(:enclosure_url) && entry.enclosure_url.present?
      return entry.enclosure_url
    end

    nil
  end

  def url_like?(str)
    str.to_s.match?(%r{\Ahttps?://}i)
  end

  def extract_guid(entry)
    # Prefer explicit ID, fall back to URL, then generate from content
    entry.entry_id.presence ||
      (entry.respond_to?(:id) ? entry.id.presence : nil) ||
      (entry.respond_to?(:url) ? entry.url.presence : nil) ||
      (entry.respond_to?(:link) ? entry.link.presence : nil) ||
      Digest::SHA1.hexdigest("#{entry.title}#{entry.published}")
  end

  def extract_content(entry)
    # Prefer full content, fall back to summary
    content = entry.content.presence || entry.summary.presence || ""
    # Unwrap double-encoded CDATA (malformed but common in feeds)
    content = unwrap_cdata(content)
    # Sanitize HTML to prevent XSS
    ContentSanitizer.sanitize(content.strip)
  end

  def unwrap_cdata(text)
    # Handle double-encoded CDATA: &lt;![CDATA[...]]&gt; or <![CDATA[...]]>
    text.gsub(/\A\s*<!\[CDATA\[(.*)\]\]>\s*\z/m, '\1')
  end

  def extract_categories(entry)
    return [] unless entry.respond_to?(:categories)

    entry.categories.to_a.compact.map(&:to_s)
  end

  def extract_enclosures(entry)
    enclosures = []

    # Standard enclosure (RSS)
    if entry.respond_to?(:enclosure_url) && entry.enclosure_url.present?
      enclosures << ParsedEnclosure.new(
        url: entry.enclosure_url,
        type: entry.enclosure_type || "application/octet-stream",
        title: "",
        length: entry.enclosure_length
      )
    end

    # Media content (Media RSS / iTunes)
    if entry.respond_to?(:media_contents)
      entry.media_contents.to_a.each do |media|
        enclosures << ParsedEnclosure.new(
          url: media.url,
          type: media.type || "application/octet-stream",
          title: media.title.to_s,
          length: media.file_size
        )
      end
    end

    enclosures
  end
end
