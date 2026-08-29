# The Faraday connection every outbound fetch in the app is built from.
#
# There are five services that fetch a URL somebody else wrote -- FeedFetcher,
# EmbedPolicyProbe, ImageCacher, FaviconFetcher and GoogleNewsRssFetcher -- and
# before this existed each built its own Faraday stack. That is five places to
# remember a destination check in, and one forgotten stack is the whole hole.
# They now differ only in timeouts, redirect limit and User-Agent; the security
# properties are decided here.
#
# LlmClient is deliberately not on that list. It talks to an operator-configured
# endpoint (OLLAMA_URL, a host on the LAN), not to a URL that arrived in a feed,
# and it is exactly the kind of private-range destination OutboundDestination
# refuses. Routing it through this would break it to guard against a threat it
# does not have: nothing user-controlled reaches its URL.
module OutboundHttp
  # Refuses a request whose destination OutboundDestination rejects, and pins
  # the one it accepts.
  #
  # Registered after :follow_redirects rather than before it, which is what
  # makes it run on every hop. FollowRedirects re-enters the stack below itself
  # for each redirect (Faraday::FollowRedirects::Middleware#perform_with_
  # redirection calls @app.call), so a guard above it would see only the URL as
  # given -- and a public host that answers 302 with Location: http://127.0.0.1/
  # would walk straight through it.
  class Guard < Faraday::Middleware
    def call(env)
      pinned = OutboundDestination.pinned_address(env[:url])
      env[:request][:context] = (env[:request][:context] || {}).merge(pinned_ip: pinned)
      @app.call(env)
    end
  end

  # Connects to the address the guard just validated instead of resolving the
  # hostname a second time.
  #
  # Without this there are two lookups per request -- one to judge the name, one
  # inside Net::HTTP to connect -- and a name whose answer changes between them
  # is judged on one address and connected to another. That is DNS rebinding,
  # and a record with a one-second TTL alternating between a public address and
  # 127.0.0.1 is enough to drive it. Net::HTTP#ipaddr sets the address the TCP
  # connection goes to while leaving #address alone, so the Host header, the TLS
  # SNI name and the certificate hostname check all still use the hostname; the
  # request is unchanged, only the lookup is skipped.
  class PinnedNetHttp < Faraday::Adapter::NetHttp
    def build_connection(env)
      super.tap do |http|
        pinned = env[:request][:context]&.[](:pinned_ip)
        http.ipaddr = pinned if pinned
      end
    end
  end

  # @param timeout [Integer] whole-request timeout in seconds
  # @param open_timeout [Integer] connect timeout in seconds
  # @param redirect_limit [Integer] how many hops to follow
  # @param user_agent [String, nil] set as a connection default; callers that
  #   set User-Agent per request pass nil
  def self.connection(timeout:, open_timeout: 10, redirect_limit: 5, user_agent: nil)
    Faraday.new do |f|
      f.headers["User-Agent"] = user_agent if user_agent
      f.options.timeout = timeout
      f.options.open_timeout = open_timeout
      f.response :follow_redirects, limit: redirect_limit
      f.use Guard
      f.adapter PinnedNetHttp
    end
  end
end
