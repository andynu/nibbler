# Asks a page's origin server whether it will let itself be framed.
#
# Nothing in the browser can answer this for the embedder. When a frame is
# refused by X-Frame-Options or by a Content-Security-Policy frame-ancestors
# directive, the iframe element fires `load`, not `error`; the refusal commits
# a document on the target's own origin, so from the parent contentDocument
# reads as null and contentWindow.location raises SecurityError. That is
# indistinguishable from a page that framed successfully. Measured against both
# header forms in Chromium 151.0.7922.34 and Firefox 153.0 (ttrb-watz): `load`
# fired, `error` did not, and every probe came back identical to the
# embeddable control. The only trace is a console message, which script cannot
# read.
#
# So the answer exists solely in the response headers, and only the server is
# on the reading side of them.
class EmbedPolicyProbe
  # :embeddable  the headers permit a third-party frame
  # :blocked     the headers refuse one, and the reader needs the fallback
  # :unknown     the site could not be asked; say nothing and let the frame try
  Result = Struct.new(:status, :reason) do
    def blocked?
      status == :blocked
    end

    def unknown?
      status == :unknown
    end
  end

  USER_AGENT = "Nibbler/1.0 (+https://github.com/andyjakubowski/nibbler)".freeze
  DEFAULT_TIMEOUT = 8
  OPEN_TIMEOUT = 5
  CACHE_TTL = 12.hours

  # The single reason every :unknown answer carries across the API boundary.
  #
  # GET /api/v1/entries/:id/embed_policy runs this probe inline and renders
  # #reason, so whatever distinguishes one failure from another is readable by
  # anything that can open an article. The old strings distinguished a refused
  # connection from a timeout from a DNS failure, which is a port scanner: aim
  # an entry's link at 127.0.0.1:5432 and the wording of the answer says
  # whether something is listening. The detail is still written to the log,
  # which is where it was actually useful.
  UNKNOWN_REASON = "Unavailable".freeze

  # The two values every browser still enforces. See #xfo_result for why the
  # rest are treated as permission.
  BLOCKING_XFO = %w[deny sameorigin].freeze

  # Memoized probe. A page is read once per reader per half day rather than on
  # every open, which matters because the reader walking a list with j/k in
  # iframe view revisits the same articles constantly.
  #
  # Only definite answers are cached. A timeout is a fact about this minute's
  # network, not about the site, and caching it would hide the site for half a
  # day.
  def self.for(url)
    key = cache_key(url)
    cached = Rails.cache.read(key)
    return Result.new(cached[:status], cached[:reason]) if cached

    result = new(url).call
    Rails.cache.write(key, result.to_h, expires_in: CACHE_TTL) unless result.unknown?
    result
  end

  def self.cache_key(url)
    "embed_policy/#{Digest::SHA256.hexdigest(url.to_s)}"
  end

  # bin/e2e-server sets OFFLINE_FEED_FETCH=1 so the Playwright suite never
  # leaves the host. The fixture links point at hosts that do not exist, so
  # without this every probe would sit through a connection timeout before
  # reporting what this returns immediately.
  def self.offline?
    ENV["OFFLINE_FEED_FETCH"] == "1"
  end

  def initialize(url)
    @url = url
  end

  def call
    return unknown("No link") if @url.blank?
    return unknown("Offline") if self.class.offline?

    response = fetch_headers
    return unknown("HTTP #{response.status}") unless response.success?

    policy_from(response.headers)
  rescue Faraday::TimeoutError
    unknown("Connection timed out")
  rescue Faraday::Error => e
    unknown("Connection failed: #{e.message}")
  rescue StandardError => e
    unknown("Unexpected error: #{e.message}")
  end

  private

  # Every way of failing produces the same answer for the caller and keeps its
  # own wording for the log. See UNKNOWN_REASON.
  def unknown(detail)
    Rails.logger.info { "EmbedPolicyProbe(#{@url}): #{detail}" }
    Result.new(:unknown, UNKNOWN_REASON)
  end

  # HEAD keeps the probe to one round trip and no body on the sites that
  # support it. Plenty do not: 405 is the documented refusal, but bot filters
  # answer 403 and some CDNs 404. Those have to be asked with a GET, whose
  # headers are the same headers.
  def fetch_headers
    response = connection.head(@url)
    return response if response.success?

    connection.get(@url)
  end

  def policy_from(headers)
    # frame-ancestors supersedes X-Frame-Options wherever both are present
    # (CSP Level 2 §3.4.2), so it decides first. Content-Security-Policy-
    # Report-Only is deliberately never consulted: it reports, it does not
    # block, and a page under a report-only policy frames fine.
    ancestors = frame_ancestors(headers["content-security-policy"])
    return csp_result(ancestors) if ancestors.any?

    xfo_result(headers["x-frame-options"])
  end

  # Every frame-ancestors directive in the header, each as its source list.
  #
  # One header can carry several policies separated by commas, each a
  # semicolon-separated directive list, and the most restrictive of them wins.
  # Splitting on both delimiters yields every directive across every policy;
  # sources within a directive are space-separated, so nothing is lost.
  def frame_ancestors(csp)
    return [] if csp.blank?

    csp.split(/[;,]/).filter_map do |directive|
      name, *sources = directive.split(/\s+/).reject(&:empty?)
      sources.map(&:downcase) if name&.downcase == "frame-ancestors"
    end
  end

  def csp_result(directives)
    refusing = directives.find { |sources| !allows_third_party?(sources) }
    return Result.new(:embeddable, nil) if refusing.nil?

    Result.new(:blocked, "content-security-policy: frame-ancestors #{refusing.join(' ')}")
  end

  # A frame-ancestors list names who may embed. 'none' names nobody, a bare *
  # names everybody, and anything else is the site's own origins and its
  # partners' -- a list a third-party reader is never on. Treating a specific
  # list as a refusal is what puts the fallback in front of `frame-ancestors
  # 'self'`, which is how most sites write the rule.
  def allows_third_party?(sources)
    sources.include?("*")
  end

  # DENY and SAMEORIGIN both refuse a third-party embedder. Every other value
  # is a refusal no current browser enforces: ALLOW-FROM never shipped in
  # Chromium and Firefox dropped it in 70, and an unparseable value is ignored
  # outright. Reporting those as blocked would put the fallback in front of
  # pages that frame perfectly well.
  def xfo_result(header)
    return Result.new(:embeddable, nil) if header.blank?

    refusing = header.split(",").map { |value| value.strip.downcase }.find { |value| BLOCKING_XFO.include?(value) }
    return Result.new(:embeddable, nil) if refusing.nil?

    Result.new(:blocked, "x-frame-options: #{refusing}")
  end

  def connection
    @connection ||= OutboundHttp.connection(
      timeout: DEFAULT_TIMEOUT,
      open_timeout: OPEN_TIMEOUT,
      redirect_limit: 5,
      user_agent: USER_AGENT
    )
  end
end
