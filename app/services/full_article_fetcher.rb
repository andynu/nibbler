# Fetches the publisher's own page for an article the feed only excerpted, and
# returns the article out of it.
#
# Many feeds publish a headline and two sentences. For those entries the stored
# body is not enough for a summarizer to compress, not enough for search to
# index beyond the title, and not enough for TTS to read. This is the one place
# that goes and gets the rest.
#
# == It is not polite by accident
#
# Every request here goes to a stranger's server because a feed said so, so the
# fetch is bounded on four axes and each bound is deliberate:
#
# - DomainThrottler, the same one FetchStoryArticlesJob uses, keeps requests to
#   one host at least DomainThrottler::DOMAIN_DELAY apart. The record is written
#   in an +ensure+, so a host that times out is throttled exactly like one that
#   answers; a failing site is the last thing to hammer.
# - A real User-Agent naming the project and its repository, so an operator
#   reading their logs can see who this is and block it if they want to.
# - Timeouts, so a server that accepts a connection and then says nothing costs
#   TIMEOUT seconds rather than a thread.
# - MAX_BYTES, enforced while the body streams rather than after it is in
#   memory. An arbitrary URL can serve an arbitrarily large response, and
#   reading it whole to find out how big it was is the failure mode being
#   avoided.
#
# == Every failure looks the same to the reader
#
# A paywall, a 403 from a bot filter, a timeout, a page with no prose in it: the
# reader is told the full article could not be retrieved and given the link,
# with no cause attached. That is a decision, not an omission. Most walls answer
# 200 with a truncated body, so telling one apart from an extraction that simply
# found little would be a guess, and a timeout reported as a paywall is worse
# than saying nothing about why. The specific reason is carried in Result#detail
# for the log and for the stored row; it does not reach the page.
#
# @example
#   result = FullArticleFetcher.new("https://example.com/story").call
#   result.ok?   # => true
#   result.html  # => "<p>The vote failed...</p>"
#
# @see ArticleExtractor for the scoring that picks the article out of the page
# @see EntryFullText for the row this is persisted into and the retry window
# @see OutboundHttp for the destination guard every outbound fetch shares
class FullArticleFetcher
  # Raised internally when the body passes MAX_BYTES mid-stream. Never escapes;
  # #call turns it into a failed Result like any other refusal.
  class TooLarge < StandardError; end

  # :ok      html holds the extracted article
  # :failed  nothing usable; detail says what happened, for the log only
  Result = Data.define(:status, :html, :detail) do
    def ok?
      status == :ok
    end
  end

  # Names the project and points at its source, which is what an operator needs
  # to identify or block this traffic. The same string EmbedPolicyProbe and
  # GoogleNewsRssFetcher send.
  USER_AGENT = "Nibbler/1.0 (+https://github.com/andyjakubowski/nibbler)".freeze

  # Whole-request budget. Longer than EmbedPolicyProbe's 8s because that one
  # only needs headers and this one needs a whole document over whatever the
  # publisher's CDN is doing today; short enough that a reader who pressed the
  # button is not left waiting on a wedged host.
  TIMEOUT = 15
  OPEN_TIMEOUT = 5

  # Hops followed, matching every other fetcher in the app. News URLs redirect
  # through AMP, syndication and consent interstitials, so 0 would fail on
  # ordinary pages.
  REDIRECT_LIMIT = 5

  # Ceiling on the response body, enforced while it streams.
  #
  # 2MB is generous for an article page: a heavy news page with inline SVG and
  # JSON-LD runs 300-600KB of HTML, and images are not fetched here at all. Past
  # this the page is not an article, and reading further only spends memory.
  MAX_BYTES = 2.megabytes

  # Only markup is parsed. A PDF or a video that a link happens to point at is
  # not an extraction failure worth reading 2MB to discover.
  HTML_CONTENT_TYPE = %r{\A(text/html|application/xhtml\+xml)}i

  # bin/e2e-server sets OFFLINE_FEED_FETCH=1 so the Playwright suite never leaves
  # the host. The seeded links point at hosts that do not exist, so without this
  # a press would sit through OPEN_TIMEOUT before failing. Same switch and same
  # reason as EmbedPolicyProbe.offline?.
  def self.offline?
    ENV["OFFLINE_FEED_FETCH"] == "1"
  end

  # @param url [String] the article's own URL, from Entry#link
  def initialize(url)
    @url = url.to_s
  end

  # Fetch and extract, or say why not.
  #
  # Raises nothing. Every outcome the caller can do something about is a Result,
  # because the calling feature's contract is to degrade to the feed excerpt
  # rather than fail.
  #
  # @return [Result]
  def call
    return failure("no link") if @url.blank?
    return failure("offline") if self.class.offline?

    DomainThrottler.wait_for(@url)
    begin
      response = fetch
    ensure
      DomainThrottler.record(@url)
    end

    return failure("HTTP #{response[:status]}") unless (200..299).cover?(response[:status])
    return failure("content-type #{response[:content_type]}") unless html?(response[:content_type])

    extracted = ArticleExtractor.new(response[:body], url: @url).extract
    return failure("no article found in the page") if extracted.blank?

    Result.new(status: :ok, html: extracted, detail: nil)
  rescue TooLarge
    failure("response over #{MAX_BYTES} bytes")
  rescue Faraday::TimeoutError
    failure("timed out")
  rescue Faraday::Error => e
    # OutboundDestination::Refused subclasses Faraday::ConnectionFailed, so a
    # link pointing at a private address lands here with everything else.
    failure("#{e.class}: #{e.message}")
  rescue StandardError => e
    # A malformed document that takes the parser down is still just a page that
    # could not be read. Reported, not raised, for the same reason as the rest.
    failure("#{e.class}: #{e.message}")
  end

  private

  def failure(detail)
    Rails.logger.info { "FullArticleFetcher(#{@url}): #{detail}" }
    Result.new(status: :failed, html: "", detail: detail)
  end

  def html?(content_type)
    content_type.to_s.match?(HTML_CONTENT_TYPE)
  end

  # Streams the body into a bounded buffer.
  #
  # +on_data+ rather than reading +response.body+ because the cap has to apply
  # to what is received, not to what was already allocated. Faraday nils the
  # response body when a stream callback is set, so the buffer here is the only
  # copy.
  #
  # The callback fires for redirect responses too, since the redirect middleware
  # re-enters the adapter with the same request options. Faraday restarts its
  # cumulative +received+ count per response, so a chunk whose size equals the
  # count is the first of a new body and the buffer starts over -- otherwise a
  # 301 with an explanatory body would be prepended to the article.
  def fetch
    buffer = +""
    response = connection.get(@url) do |req|
      req.headers["Accept"] = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"
      req.options.on_data = proc do |chunk, received, _env|
        buffer.clear if received == chunk.bytesize
        buffer << chunk
        raise TooLarge if buffer.bytesize > MAX_BYTES
      end
    end

    { status: response.status, content_type: response.headers["content-type"], body: buffer }
  end

  def connection
    @connection ||= OutboundHttp.connection(
      timeout: TIMEOUT,
      open_timeout: OPEN_TIMEOUT,
      redirect_limit: REDIRECT_LIMIT,
      user_agent: USER_AGENT
    )
  end
end
