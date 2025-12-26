# Sanitizes HTML content from RSS feeds to prevent XSS attacks
# while preserving article formatting
class ContentSanitizer
  # Allowed tags for article content
  ALLOWED_TAGS = %w[
    a abbr acronym address article aside audio
    b blockquote br
    caption cite code col colgroup
    dd del details dfn div dl dt
    em
    figcaption figure footer
    h1 h2 h3 h4 h5 h6 header hr
    i iframe img ins
    kbd
    li
    mark
    nav
    ol
    p pre
    q
    rp rt ruby
    s samp section small source span strike strong sub summary sup
    table tbody td tfoot th thead time tr track
    u ul
    var video
    wbr
  ].freeze

  # Allowed attributes for tags
  ALLOWED_ATTRIBUTES = {
    :all => %w[class id lang title dir],
    "a" => %w[href rel target],
    "abbr" => %w[title],
    "blockquote" => %w[cite],
    "col" => %w[span width],
    "colgroup" => %w[span width],
    "img" => %w[alt height src srcset sizes width loading],
    "ol" => %w[start type reversed],
    "q" => %w[cite],
    "source" => %w[src srcset type media sizes],
    "table" => %w[summary width],
    "td" => %w[abbr colspan headers rowspan width],
    "th" => %w[abbr colspan headers rowspan scope width],
    "time" => %w[datetime],
    "track" => %w[default kind label src srclang],
    "ul" => %w[type],
    "video" => %w[autoplay controls height loop muted poster preload src width],
    "audio" => %w[autoplay controls loop muted preload src],
    "iframe" => %w[src width height frameborder allowfullscreen allow]
  }.freeze

  # Whitelisted iframe sources (for embedded videos)
  IFRAME_WHITELIST = [
    /\Ahttps?:\/\/(www\.)?youtube\.com\/embed\//,
    /\Ahttps?:\/\/(www\.)?youtube-nocookie\.com\/embed\//,
    /\Ahttps?:\/\/player\.vimeo\.com\/video\//,
    /\Ahttps?:\/\/(www\.)?dailymotion\.com\/embed\//,
    /\Ahttps?:\/\/open\.spotify\.com\/embed\//,
    /\Ahttps?:\/\/w\.soundcloud\.com\/player\//,
    /\Ahttps?:\/\/bandcamp\.com\/EmbeddedPlayer\//,
    /\Ahttps?:\/\/(www\.)?slideshare\.net\/slideshow\/embed_code\//,
    /\Ahttps?:\/\/speakerdeck\.com\/player\//
  ].freeze

  def initialize(html)
    @html = html || ""
  end

  def sanitize
    return "" if @html.blank?

    # Parse with Loofah
    doc = Loofah.fragment(@html)

    # Use only our custom scrubber (handles everything including removal)
    doc.scrub!(custom_scrubber)

    # Convert to string
    doc.to_s
  end

  def self.sanitize(html)
    new(html).sanitize
  end

  private

  # Tags whose content should be completely removed (not just the tag)
  REMOVE_WITH_CONTENT = %w[script style noscript template].freeze

  def custom_scrubber
    Loofah::Scrubber.new do |node|
      if node.element?
        tag_name = node.name.downcase

        # Remove these tags AND their content entirely
        if REMOVE_WITH_CONTENT.include?(tag_name)
          node.remove
          next Loofah::Scrubber::STOP
        end

        # Check if tag is allowed
        unless ALLOWED_TAGS.include?(tag_name)
          node.remove
          next Loofah::Scrubber::STOP
        end

        # Special handling for iframes
        if tag_name == "iframe"
          src = node["src"]
          unless allowed_iframe?(src)
            node.remove
            next Loofah::Scrubber::STOP
          end
        end

        # Filter attributes
        allowed_attrs = (ALLOWED_ATTRIBUTES[:all] || []) +
                       (ALLOWED_ATTRIBUTES[tag_name] || [])

        node.attributes.each do |name, _attr|
          attr_name = name.downcase

          # Remove attribute if not allowed
          unless allowed_attrs.include?(attr_name)
            node.remove_attribute(name)
            next
          end

          # Sanitize href/src attributes
          if %w[href src].include?(attr_name)
            sanitize_url_attribute(node, name)
          end
        end

        # Remove any on* event handlers (belt and suspenders)
        node.attributes.keys.each do |name|
          if name.downcase.start_with?("on")
            node.remove_attribute(name)
          end
        end
      end

      Loofah::Scrubber::CONTINUE
    end
  end

  def allowed_iframe?(src)
    return false if src.blank?
    IFRAME_WHITELIST.any? { |pattern| pattern.match?(src) }
  end

  def sanitize_url_attribute(node, attr_name)
    value = node[attr_name]
    return if value.blank?

    # Remove javascript: and data: URLs (except data:image for inline images)
    if value.match?(/\Ajavascript:/i)
      node.remove_attribute(attr_name)
    elsif value.match?(/\Adata:/i) && !value.match?(/\Adata:image\//i)
      node.remove_attribute(attr_name)
    end
  end
end
