# Picks the article out of a fetched web page and throws the rest away.
#
# A publisher's page is mostly not the article: navigation, a cookie banner, a
# newsletter box, related-story rails, comments, a footer sitemap. Handing all
# of that to a summarizer or a search index is worse than handing it the feed's
# two-sentence excerpt, because the noise is longer than the signal and reads as
# article text to anything counting characters.
#
# The approach is the one Arc90's readability described and every reimplementation
# since has kept: prose lives in paragraphs, so score each paragraph by how much
# prose it holds, credit that score to its parent, and the element that
# accumulates the most is the article body. It is deliberately not a list of
# per-site selectors, which would need one entry per publisher and would rot.
#
# No gem does this here. The two Ruby readability ports are unmaintained (the
# newest release of either predates Nokogiri 1.13) and both parse with the HTML4
# parser, so this is Nokogiri's HTML5 parser plus about eighty lines of scoring.
#
# Pure: no network, no database, no clock. FullArticleFetcher does the fetching
# and hands the body here.
#
# @example
#   ArticleExtractor.new(page_html, url: "https://example.com/story").extract
#   # => "<p>The vote failed...</p><p>Members left early...</p>"
#
# @see FullArticleFetcher for the caller, the politeness rules and the size cap
# @see ContentSanitizer for the gate the result goes through, the same one feed
#   bodies pass at ingest
class ArticleExtractor
  # Removed outright before scoring, content and all.
  #
  # Chrome, not article, in every layout: a <nav> is links, a <form> is a
  # newsletter signup or a search box, and <header>/<footer> inside an <article>
  # carry the byline and the share buttons rather than the piece. Losing a byline
  # is the accepted cost -- Entry#author already has it from the feed.
  #
  # ContentSanitizer would drop script and style later anyway, but they have to
  # go before scoring: an inline analytics blob is thousands of characters of
  # "text" that would out-score the article.
  CHROME_SELECTOR = "script, style, noscript, template, svg, form, nav, aside, header, footer, " \
                    "button, input, select, textarea, [aria-hidden=true], [hidden]".freeze

  # Class and id substrings that argue for or against an element being the
  # article. Weak signals applied as a bounded bonus, never as a decision: a
  # <div class="post-content"> that holds no paragraphs still scores nothing,
  # and a comment thread long enough to out-score the article by prose alone
  # still loses on the penalty rather than being excluded by name.
  POSITIVE_PATTERN = /article|body|content|entry|hentry|main|page|post|story|text|blog/i
  NEGATIVE_PATTERN = /comment|combx|disqus|foot|header|menu|meta|nav|promo|related|
                      scroll|share|shoutbox|sidebar|sponsor|social|teaser|widget|
                      banner|newsletter|subscribe|paywall|popup|modal|breadcrumb/xi

  # Weight of a class or id match, in the same units as a paragraph's score. A
  # paragraph of ordinary prose is worth 2 to 4, so 25 is worth roughly eight
  # paragraphs: enough to settle a close call between the article and a sidebar,
  # not enough to hand the page to an empty <div id="content">.
  ATTRIBUTE_WEIGHT = 25

  # Paragraphs shorter than this are furniture -- a caption, a byline, a "Read
  # more" -- and score nothing. Long enough to exclude those, short enough that a
  # one-line opening paragraph still counts.
  MIN_PARAGRAPH_CHARS = 25

  # Ceiling on the length bonus one paragraph contributes, so a single enormous
  # block quote cannot decide the page on its own.
  MAX_LENGTH_BONUS = 3

  # An element whose text is mostly link text is a list of links, whatever its
  # class says. Above this share of characters inside <a>, the score is
  # discarded entirely.
  #
  # 0.5 rather than something stricter because a normally sourced article does
  # run 20-30% link text, and a reference-heavy post more.
  MAX_LINK_DENSITY = 0.5

  # Elements that can be the article container. Anything else that accumulates
  # score -- a <td>, a <blockquote> -- is a container the page happens to nest
  # paragraphs in, not the body.
  CONTAINER_TAGS = %w[div article section main td body].freeze

  # Attributes carrying a URL that has to survive the move off the publisher's
  # origin.
  URL_ATTRIBUTES = { "a" => "href", "img" => "src", "source" => "src" }.freeze

  # @param html [String] the page as fetched
  # @param url [String, nil] the URL it was fetched from, used to absolutize
  #   relative links and image sources
  def initialize(html, url: nil)
    @html = html.to_s
    @url = url
  end

  # The article's markup, sanitized.
  #
  # @return [String] sanitized HTML, or "" when the page holds no prose
  def extract
    return "" if @html.blank?

    doc = Nokogiri::HTML5(@html)
    doc.css(CHROME_SELECTOR).each(&:remove)

    body = best_container(doc)
    return "" if body.nil?

    absolutize(body)
    ContentSanitizer.sanitize(body.inner_html)
  end

  private

  # The element that accumulated the most paragraph score.
  def best_container(doc)
    scores = score_containers(doc)
    return nil if scores.empty?

    scores.max_by { |_node, score| score }&.first
  end

  # Every candidate container with the score its descendants earned it.
  #
  # Credit runs two levels up, halved at the second, which is what separates the
  # article <div> from the single <p> inside it: a page whose paragraphs are each
  # wrapped in their own <div> would otherwise score every wrapper equally and
  # return one paragraph as the article.
  def score_containers(doc)
    scores = Hash.new(0.0)

    doc.css("p, pre").each do |paragraph|
      text = paragraph.text.to_s.squish
      next if text.length < MIN_PARAGRAPH_CHARS

      score = paragraph_score(text)
      parent = paragraph.parent
      next unless parent.respond_to?(:name)

      credit(scores, parent, score)
      credit(scores, parent.parent, score / 2)
    end

    scores.filter_map { |node, score|
      density = link_density(node)
      next if density > MAX_LINK_DENSITY

      [ node, score * (1 - density) ]
    }.to_h
  end

  def credit(scores, node, score)
    return unless node.respond_to?(:name) && CONTAINER_TAGS.include?(node.name)

    scores[node] = attribute_bonus(node) if scores[node].zero?
    scores[node] += score
  end

  # One paragraph's worth: a base point, a point per comma as a proxy for clause
  # structure, and a bounded length bonus.
  def paragraph_score(text)
    1 + text.count(",") + [ text.length / 100, MAX_LENGTH_BONUS ].min
  end

  def attribute_bonus(node)
    signature = "#{node['class']} #{node['id']}"
    bonus = 0.0
    bonus += ATTRIBUTE_WEIGHT if signature.match?(POSITIVE_PATTERN)
    bonus -= ATTRIBUTE_WEIGHT if signature.match?(NEGATIVE_PATTERN)
    bonus += ATTRIBUTE_WEIGHT if node.name == "article"
    bonus
  end

  # Share of this element's characters that sit inside a link.
  def link_density(node)
    total = node.text.to_s.squish.length
    return 0.0 if total.zero?

    linked = node.css("a").sum { |anchor| anchor.text.to_s.squish.length }
    linked.to_f / total
  end

  # Rewrites relative URLs against the page they came from.
  #
  # Without this a stored body's images and links point at paths on Nibbler's own
  # origin, which serve 404s. URI.join raises on the malformed URLs real pages
  # carry, so a bad one is left exactly as it was rather than taking the article
  # down with it.
  def absolutize(node)
    return if @url.blank?

    URL_ATTRIBUTES.each do |tag, attribute|
      node.css(tag).each do |element|
        value = element[attribute]
        next if value.blank?

        element[attribute] = absolute_url(value)
      end
    end
  end

  def absolute_url(value)
    URI.join(@url, value).to_s
  rescue URI::Error, ArgumentError
    value
  end
end
