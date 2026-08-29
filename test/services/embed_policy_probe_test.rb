require "test_helper"

class EmbedPolicyProbeTest < ActiveSupport::TestCase
  URL = "https://example.com/article".freeze

  # Takes the header hash positionally and nothing else. A keyword parameter
  # here would swallow the brace-less `stub_headers("X-Frame-Options" => ...)`
  # call form as keyword arguments and leave the method with no positional
  # argument at all.
  def stub_headers(headers)
    stub_request(:head, URL).to_return(status: 200, headers: headers)
  end

  def probe(url = URL)
    EmbedPolicyProbe.new(url).call
  end

  test "reports embeddable when nothing refuses framing" do
    stub_headers({})

    assert_equal :embeddable, probe.status
    assert_nil probe.reason
  end

  test "reports blocked for X-Frame-Options DENY" do
    stub_headers("X-Frame-Options" => "DENY")

    result = probe
    assert result.blocked?
    assert_equal "x-frame-options: deny", result.reason
  end

  test "reports blocked for X-Frame-Options SAMEORIGIN" do
    stub_headers("X-Frame-Options" => "SAMEORIGIN")

    assert_equal :blocked, probe.status
  end

  # ALLOW-FROM never shipped in Chromium and Firefox dropped it in 70, so a
  # page carrying it frames fine everywhere the reader runs.
  test "ignores X-Frame-Options values no browser enforces" do
    stub_headers("X-Frame-Options" => "ALLOW-FROM https://friend.example")

    assert_equal :embeddable, probe.status
  end

  test "ignores an unparseable X-Frame-Options value" do
    stub_headers("X-Frame-Options" => "ALLOWALL")

    assert_equal :embeddable, probe.status
  end

  test "reports blocked for frame-ancestors none among other directives" do
    stub_headers("Content-Security-Policy" => "default-src 'self'; frame-ancestors 'none'; img-src *")

    result = probe
    assert result.blocked?
    assert_equal "content-security-policy: frame-ancestors 'none'", result.reason
  end

  # 'self' plus a partner list is how most sites write the rule, and a
  # third-party reader is on none of those lists.
  test "reports blocked for a frame-ancestors list that names specific origins" do
    stub_headers("Content-Security-Policy" => "frame-ancestors 'self' https://partner.example")

    assert_equal :blocked, probe.status
  end

  test "reports embeddable for frame-ancestors star" do
    stub_headers("Content-Security-Policy" => "frame-ancestors *")

    assert_equal :embeddable, probe.status
  end

  test "reports embeddable for a CSP without a frame-ancestors directive" do
    stub_headers("Content-Security-Policy" => "default-src 'self'")

    assert_equal :embeddable, probe.status
  end

  # Report-Only reports; it does not block.
  test "ignores frame-ancestors in a report-only policy" do
    stub_headers("Content-Security-Policy-Report-Only" => "frame-ancestors 'none'")

    assert_equal :embeddable, probe.status
  end

  # CSP Level 2 §3.4.2: frame-ancestors supersedes X-Frame-Options.
  test "lets frame-ancestors override a conflicting X-Frame-Options" do
    stub_headers("X-Frame-Options" => "DENY", "Content-Security-Policy" => "frame-ancestors *")

    assert_equal :embeddable, probe.status
  end

  test "finds frame-ancestors in the second of two comma-separated policies" do
    stub_headers("Content-Security-Policy" => "default-src *, frame-ancestors 'none'")

    assert_equal :blocked, probe.status
  end

  test "falls back to GET when the site refuses HEAD" do
    stub_request(:head, URL).to_return(status: 405)
    stub_request(:get, URL).to_return(status: 200, headers: { "X-Frame-Options" => "DENY" })

    assert_equal :blocked, probe.status
    assert_requested :get, URL
  end

  test "reads the headers of the page a redirect lands on" do
    stub_request(:head, URL).to_return(status: 302, headers: { "Location" => "https://example.com/final" })
    stub_request(:head, "https://example.com/final").to_return(status: 200, headers: { "X-Frame-Options" => "DENY" })

    assert_equal :blocked, probe.status
  end

  # A page the probe could not read says nothing about whether it frames, and
  # the reader is better served by a frame that might work than by a fallback
  # that is a guess.
  test "reports unknown when both HEAD and GET fail" do
    stub_request(:head, URL).to_return(status: 500)
    stub_request(:get, URL).to_return(status: 500)

    result = probe
    assert result.unknown?
    assert_equal EmbedPolicyProbe::UNKNOWN_REASON, result.reason
  end

  test "reports unknown when the connection fails" do
    stub_request(:head, URL).to_raise(Faraday::ConnectionFailed.new("boom"))

    assert_equal :unknown, probe.status
  end

  test "reports unknown when the request times out" do
    stub_request(:head, URL).to_raise(Faraday::TimeoutError)

    result = probe
    assert_equal :unknown, result.status
    assert_equal EmbedPolicyProbe::UNKNOWN_REASON, result.reason
  end

  test "reports unknown for a blank link without opening a socket" do
    result = probe("")

    assert_equal :unknown, result.status
    assert_equal EmbedPolicyProbe::UNKNOWN_REASON, result.reason
  end

  test "opens no socket when OFFLINE_FEED_FETCH is set" do
    with_offline_fetch do
      result = probe

      assert_equal :unknown, result.status
      assert_equal EmbedPolicyProbe::UNKNOWN_REASON, result.reason
    end
  end

  # The reason crosses the API boundary. Distinguishing "connection refused"
  # from "connection timed out" there tells the caller whether something is
  # listening on the port an entry's link names, which is a port scan.
  test "gives every unreadable answer the same reason" do
    stub_request(:head, URL).to_raise(Faraday::ConnectionFailed.new("Connection refused - connect(2) for 127.0.0.1:5432"))

    reasons = [
      probe.reason,
      probe("").reason,
      EmbedPolicyProbe.new("http://127.0.0.1:5432/").call.reason
    ]

    assert_equal [ EmbedPolicyProbe::UNKNOWN_REASON ], reasons.uniq
  end

  test "refuses a link that names a loopback address without opening a socket" do
    result = EmbedPolicyProbe.new("http://127.0.0.1:5432/").call

    assert_equal :unknown, result.status
    assert_not_requested :head, "http://127.0.0.1:5432/"
  end

  test "refuses a link that names the cloud metadata endpoint" do
    result = EmbedPolicyProbe.new("http://169.254.169.254/latest/meta-data/").call

    assert_equal :unknown, result.status
    assert_not_requested :head, "http://169.254.169.254/latest/meta-data/"
  end

  # A guard on the URL as given is defeated by a public host that answers 302
  # with an internal Location, so the check runs on the hop, not on the request.
  test "refuses an internal address a public host redirects to" do
    stub_request(:head, URL).to_return(status: 302, headers: { "Location" => "http://10.1.2.3/admin" })

    result = probe

    assert_equal :unknown, result.status
    assert_not_requested :head, "http://10.1.2.3/admin"
  end

  test "refuses a hostname that resolves to a private address" do
    with_dns("intranet.example" => "192.168.1.5") do
      result = EmbedPolicyProbe.new("https://intranet.example/page").call

      assert_equal :unknown, result.status
      assert_not_requested :head, "https://intranet.example/page"
    end
  end

  test "asks a site once and reuses the answer" do
    stub_headers("X-Frame-Options" => "DENY")

    with_memory_cache do
      assert EmbedPolicyProbe.for(URL).blocked?
      assert EmbedPolicyProbe.for(URL).blocked?
    end

    assert_requested :head, URL, times: 1
  end

  # A timeout is a fact about this minute's network, not about the site.
  # Caching it would hide the site for half a day.
  test "does not cache an answer it could not determine" do
    stub_request(:head, URL).to_raise(Faraday::TimeoutError)

    with_memory_cache do
      assert EmbedPolicyProbe.for(URL).unknown?
      assert EmbedPolicyProbe.for(URL).unknown?
    end

    assert_requested :head, URL, times: 2
  end

  private

  # The test environment runs on :null_store, which never returns anything, so
  # the caching examples need a store that does.
  def with_memory_cache
    previous = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    yield
  ensure
    Rails.cache = previous
  end

  def with_offline_fetch
    previous = ENV["OFFLINE_FEED_FETCH"]
    ENV["OFFLINE_FEED_FETCH"] = "1"
    yield
  ensure
    ENV["OFFLINE_FEED_FETCH"] = previous
  end
end
