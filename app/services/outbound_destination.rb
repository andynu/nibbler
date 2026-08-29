require "ipaddr"
require "socket"

# Decides whether the app is willing to open a socket to a URL that came out of
# a feed.
#
# Every outbound fetch in Nibbler starts from a string somebody else wrote: a
# feed's <link>, an <img src>, a favicon href, a redirect Location. Nothing
# about those strings says the address they name is on the public internet, and
# the host running Nibbler can reach things the public internet cannot -- the
# container's own ports, other services on the LAN, and on a cloud host the
# 169.254.169.254 metadata endpoint that hands out credentials. This module is
# the one place that says which addresses are off limits, and OutboundHttp
# applies it to every request and every redirect hop.
#
# Two properties matter more than the range list:
#
# 1. A name is judged by what it resolves to, not by how it looks. "localtest.me"
#    is a perfectly ordinary hostname that resolves to 127.0.0.1, and so is any
#    name an attacker controls.
# 2. The address that was judged is the address that gets connected to. See
#    #pinned_address.
module OutboundDestination
  # Raised in place of connecting.
  #
  # It subclasses Faraday::ConnectionFailed on purpose. A refusal is a
  # connection that did not happen, and all five callers already rescue that
  # class, so a refused destination reports itself exactly the way a dead host
  # does and no call site grows a new branch. The coupling is honest: this app
  # has one HTTP client library and the guard runs as Faraday middleware.
  class Refused < Faraday::ConnectionFailed
    def initialize(reason)
      super("refused destination (#{reason})")
    end
  end

  # Feed content can name any scheme it likes. Only these two ever reach a
  # Faraday connection legitimately, and refusing the rest here means a
  # file:// or gopher:// URL is turned away by policy rather than by whatever
  # the adapter happens to do with it.
  ALLOWED_SCHEMES = %w[http https].freeze

  # Ranges that a feed must never be able to point the app at. Each is a range
  # the host can route but the public internet cannot, or one that resolves
  # somewhere surprising.
  BLOCKED_RANGES = [
    "0.0.0.0/8",        # "this host"; 0.0.0.0 itself connects to loopback on Linux
    "10.0.0.0/8",       # RFC 1918
    "100.64.0.0/10",    # RFC 6598 carrier NAT
    "127.0.0.0/8",      # loopback
    "169.254.0.0/16",   # link-local, and with it the cloud metadata endpoint
    "172.16.0.0/12",    # RFC 1918, and the default Docker bridge
    "192.0.0.0/24",     # IETF protocol assignments
    "192.168.0.0/16",   # RFC 1918
    "198.18.0.0/15",    # benchmarking
    "224.0.0.0/4",      # multicast
    "240.0.0.0/4",      # reserved, and 255.255.255.255 with it
    "::/128",           # unspecified
    "::1/128",          # loopback
    "::ffff:0:0/96",    # IPv4-mapped; also normalized to IPv4 before the check
    "::/96",            # deprecated IPv4-compatible form of the same thing
    "fc00::/7",         # unique local
    "fe80::/10",        # link-local
    "ff00::/8"          # multicast
  ].map { |cidr| IPAddr.new(cidr) }.freeze

  # What the operating system would resolve the name to. This is deliberately
  # getaddrinfo rather than a DNS query: it is the same call Net::HTTP makes,
  # so it sees /etc/hosts, the search domains, and the non-dotted-quad spellings
  # of an address ("0177.0.0.1", "2130706433") exactly as the connection would.
  SYSTEM_RESOLVER = lambda do |host|
    Addrinfo.getaddrinfo(host, nil, nil, :STREAM).map(&:ip_address)
  end

  class << self
    # Judge a URL, and return the address the connection should be pinned to.
    #
    # @param url [URI::Generic, String]
    # @return [String, nil] the resolved address to connect to, or nil when
    #   there is nothing to pin: either the URL already names a literal address
    #   (the connection can only go where we just looked) or the name did not
    #   resolve at all, in which case there is no socket to open and the
    #   attempt fails on its own.
    # @raise [Refused] when the URL names an address the app must not reach
    def pinned_address(url)
      uri = coerce(url)
      raise Refused, "scheme #{uri.scheme.inspect}" unless ALLOWED_SCHEMES.include?(uri.scheme)

      host = uri.hostname
      raise Refused, "no host" if host.blank?

      # A literal address needs no resolver, which is what keeps this check
      # working with no DNS at all -- in the test environment, in CI, and in
      # the offline E2E server.
      literal = literal_address(host)
      if literal
        raise Refused, "literal #{host}" if blocked?(literal)

        return nil
      end

      resolved = resolve(host)
      offenders = resolved.filter_map { |address| address if blocked?(IPAddr.new(address)) }
      raise Refused, "#{host} resolves to #{offenders.join(', ')}" if offenders.any?

      resolved.first
    end

    # Whether an address falls in a range the app refuses to reach.
    #
    # IPv4-mapped IPv6 (::ffff:10.0.0.1) is normalized first so it is judged by
    # the IPv4 ranges rather than sliding past them on a technicality.
    def blocked?(ip)
      ip = ip.native if ip.ipv4_mapped?
      BLOCKED_RANGES.any? { |range| range.include?(ip) }
    end

    private

    def coerce(url)
      return url if url.is_a?(URI::Generic)

      URI.parse(url.to_s)
    rescue URI::InvalidURIError
      raise Refused, "unparseable URL"
    end

    def literal_address(host)
      IPAddr.new(host)
    rescue IPAddr::InvalidAddressError
      nil
    end

    # A name that will not resolve cannot reach anything, so a resolution
    # failure is an empty answer rather than a refusal. Reporting it as a
    # refusal would turn every dead feed domain -- and there are several in
    # production already -- into a security event in the log.
    def resolve(host)
      resolver.call(host)
    rescue SocketError, Errno::ENOENT
      []
    end

    # Overridden in the test environment, where resolving the names the suite
    # invents would mean real DNS traffic on every stubbed request. See
    # config/environments/test.rb.
    def resolver
      Rails.configuration.x.outbound_http.resolver || SYSTEM_RESOLVER
    end
  end
end
