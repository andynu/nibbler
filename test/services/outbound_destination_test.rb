require "test_helper"

class OutboundDestinationTest < ActiveSupport::TestCase
  def refusal(url)
    assert_raises(OutboundDestination::Refused) { OutboundDestination.pinned_address(url) }
  end

  test "allows a public literal address and asks for no pinning" do
    assert_nil OutboundDestination.pinned_address("https://8.8.8.8/")
  end

  test "refuses every range the host can reach but the internet cannot" do
    %w[
      http://0.0.0.0/
      http://127.0.0.1:5432/
      http://127.1.2.3/
      http://10.1.2.3/
      http://100.64.0.1/
      http://169.254.169.254/latest/meta-data/
      http://172.17.0.1/
      http://192.168.1.208/
      http://198.18.0.1/
      http://224.0.0.1/
      http://255.255.255.255/
    ].each { |url| refusal(url) }
  end

  test "refuses the IPv6 ranges as well" do
    %w[
      http://[::1]/
      http://[::]/
      http://[fd00::1]/
      http://[fe80::1]/
      http://[ff02::1]/
    ].each { |url| refusal(url) }
  end

  # ::ffff:127.0.0.1 is 127.0.0.1 wearing a different notation, and it must be
  # judged by the IPv4 ranges rather than sliding past them.
  test "refuses an IPv4-mapped IPv6 spelling of a blocked address" do
    refusal("http://[::ffff:127.0.0.1]/")
    refusal("http://[::ffff:10.0.0.1]/")
  end

  test "allows a public IPv6 literal" do
    assert_nil OutboundDestination.pinned_address("http://[2606:4700::1]/")
  end

  test "refuses a scheme no outbound fetch should ever use" do
    refusal("file:///etc/passwd")
    refusal("gopher://127.0.0.1:11211/")
  end

  test "judges a hostname by what it resolves to" do
    with_dns("intranet.example" => "192.168.1.5") do
      refusal("https://intranet.example/")
    end
  end

  test "refuses when any one of several answers is internal" do
    with_dns("split.example" => [ "93.184.216.34", "127.0.0.1" ]) do
      refusal("https://split.example/")
    end
  end

  test "returns the resolved address so the connection can be pinned to it" do
    with_dns("public.example" => [ "93.184.216.34" ]) do
      assert_equal "93.184.216.34", OutboundDestination.pinned_address("https://public.example/")
    end
  end

  # There are dead feed domains in production. A name that will not resolve
  # cannot reach anything, so this is an ordinary failed fetch rather than a
  # refusal, and it must not become one.
  test "allows a name that does not resolve" do
    assert_nil OutboundDestination.pinned_address("https://nothing-here.example/")
  end

  test "allows a name whose resolver raises" do
    previous = Rails.configuration.x.outbound_http.resolver
    Rails.configuration.x.outbound_http.resolver = ->(_host) { raise SocketError, "getaddrinfo" }

    assert_nil OutboundDestination.pinned_address("https://broken-dns.example/")
  ensure
    Rails.configuration.x.outbound_http.resolver = previous
  end

  test "refuses a URL with no host" do
    refusal("http:///path")
  end

  # The literal check runs without a resolver, which is what keeps it working
  # in the test environment, in CI and in the offline E2E server.
  test "checks a literal address without consulting the resolver" do
    previous = Rails.configuration.x.outbound_http.resolver
    Rails.configuration.x.outbound_http.resolver = ->(_host) { flunk("resolver consulted for a literal address") }

    refusal("http://127.0.0.1/")
  ensure
    Rails.configuration.x.outbound_http.resolver = previous
  end
end
