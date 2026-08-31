require "test_helper"

# Nothing here reaches the network. test_helper calls
# WebMock.disable_net_connect!, so an unstubbed host raises rather than
# resolving, and every request below is answered by an explicit stub_request.
#
# OutboundDestination still resolves the hostname before the adapter runs, and
# example.com resolves to a public address, so the destination guard is
# exercised for real rather than stubbed past.
class FullArticleFetcherTest < ActiveSupport::TestCase
  URL = "https://example.com/story".freeze

  PAGE = <<~HTML.freeze
    <html><body>
      <nav><a href="/">Home</a> <a href="/about">About</a></nav>
      <div id="content">
        <p>The council voted 5-2 to reject the rezoning, ending a two-year fight
           over the parcel on Fourth Street that neighbours had opposed.</p>
        <p>Members said the traffic study, filed in March, understated peak
           volumes by roughly a third, and asked for it to be redone.</p>
      </div>
      <div class="related"><a href="/a">More like this</a></div>
    </body></html>
  HTML

  setup do
    @original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
  end

  teardown do
    Rails.cache = @original_cache
  end

  def stub_page(body: PAGE, status: 200, headers: { "Content-Type" => "text/html; charset=utf-8" })
    stub_request(:get, URL).to_return(status: status, body: body, headers: headers)
  end

  def fetch(url = URL)
    FullArticleFetcher.new(url).call
  end

  # =========
  # Success
  # =========

  test "returns the article out of the page" do
    stub_page

    result = fetch

    assert result.ok?
    assert_includes result.html, "The council voted 5-2"
    assert_includes result.html, "understated peak"
    assert_nil result.detail
  end

  test "leaves the page's chrome behind" do
    stub_page

    html = fetch.html

    assert_not_includes html, "More like this"
    assert_not_includes html, "About"
  end

  test "sends a User-Agent naming the project" do
    stub_page

    fetch

    assert_requested(:get, URL) { |req| req.headers["User-Agent"] == FullArticleFetcher::USER_AGENT }
  end

  # ==========
  # Failures
  # ==========

  test "reports a failure for a non-2xx response" do
    stub_page(status: 403, body: "denied")

    result = fetch

    assert_not result.ok?
    assert_equal "", result.html
    assert_includes result.detail, "403"
  end

  test "reports a failure for a body that is not HTML" do
    stub_page(body: "%PDF-1.4", headers: { "Content-Type" => "application/pdf" })

    result = fetch

    assert_not result.ok?
    assert_includes result.detail, "application/pdf"
  end

  test "reports a failure for a page with no prose in it" do
    stub_page(body: "<html><body><nav><a href='/'>Home</a></nav></body></html>")

    result = fetch

    assert_not result.ok?
    assert_includes result.detail, "no article"
  end

  test "reports a failure when the request times out" do
    stub_request(:get, URL).to_raise(Faraday::TimeoutError)

    result = fetch

    assert_not result.ok?
    assert_includes result.detail, "timed out"
  end

  test "reports a failure when the connection never opens" do
    stub_request(:get, URL).to_timeout

    result = fetch

    assert_not result.ok?
    assert_equal "", result.html
  end

  test "reports a failure when the connection fails" do
    stub_request(:get, URL).to_raise(Faraday::ConnectionFailed.new("closed"))

    result = fetch

    assert_not result.ok?
    assert_equal "", result.html
  end

  # bin/e2e-server sets this so the Playwright suite never leaves the host.
  test "makes no request at all when outbound fetching is switched off" do
    stub_page

    result = nil
    ENV["OFFLINE_FEED_FETCH"] = "1"
    begin
      result = fetch
    ensure
      ENV.delete("OFFLINE_FEED_FETCH")
    end

    assert_not result.ok?
    assert_not_requested :get, URL
  end

  test "reports a failure rather than raising for a blank link" do
    result = fetch("")

    assert_not result.ok?
    assert_includes result.detail, "no link"
  end

  # A link pointing inside the network is refused by OutboundDestination before
  # any connection is made. It arrives here as a Faraday::ConnectionFailed
  # subclass, which is the point of that class hierarchy.
  test "reports a failure for a link aimed at a private address" do
    result = fetch("http://127.0.0.1/admin")

    assert_not result.ok?
    assert_not_requested(:get, "http://127.0.0.1/admin")
  end

  # ==========
  # Size cap
  # ==========

  test "refuses a body over the size cap" do
    stub_page(body: "<html><body><p>#{'x' * (FullArticleFetcher::MAX_BYTES + 1)}</p></body></html>")

    result = fetch

    assert_not result.ok?
    assert_includes result.detail, "over"
  end

  # =============
  # Politeness
  # =============

  test "records the request against the domain so the next one is spaced out" do
    stub_page

    assert_equal 0, DomainThrottler.delay_for(URL)
    fetch

    assert_operator DomainThrottler.delay_for(URL), :>, 0
  end

  # A host that times out is the last one to hammer, so the throttle is recorded
  # on the way out whatever happened.
  test "records the request even when the fetch fails" do
    stub_request(:get, URL).to_raise(Faraday::TimeoutError)

    fetch

    assert_operator DomainThrottler.delay_for(URL), :>, 0
  end

  # Asserted through the throttler rather than by timing the call: the real wait
  # is DomainThrottler::DOMAIN_DELAY seconds, and a test that sleeps it is five
  # seconds nobody gets back.
  test "waits out an outstanding delay before requesting the same domain" do
    stub_page
    waited = []

    DomainThrottler.stub(:wait_for, ->(url) { waited << url }) do
      fetch
    end

    assert_equal [ URL ], waited
  end
end
