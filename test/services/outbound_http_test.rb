require "test_helper"

class OutboundHttpTest < ActiveSupport::TestCase
  # Every service that fetches a URL somebody else wrote. A stack missing the
  # guard is the whole hole, so this asserts the shape rather than trusting
  # five separate files to keep remembering.
  def guarded_connections
    {
      "FeedFetcher" => FeedFetcher.new(Feed.new(feed_url: "https://example.com/feed.xml")).send(:connection),
      "EmbedPolicyProbe" => EmbedPolicyProbe.new("https://example.com/article").send(:connection),
      "ImageCacher" => ImageCacher.new(entries(:basic)).send(:connection),
      "FaviconFetcher" => FaviconFetcher.new(Feed.new(site_url: "https://example.com")).send(:connection),
      "GoogleNewsRssFetcher" => GoogleNewsRssFetcher.new("query").send(:connection)
    }
  end

  test "every outbound service builds a connection that carries the guard" do
    guarded_connections.each do |name, connection|
      handlers = connection.builder.handlers
      assert_includes handlers, OutboundHttp::Guard, "#{name} has no destination guard"
      assert_equal OutboundHttp::PinnedNetHttp, connection.builder.adapter.klass, "#{name} does not pin"
    end
  end

  # The guard sits below :follow_redirects so it is re-entered per hop. Above
  # it, it would see only the URL as given.
  test "the guard runs after redirects are followed, not before" do
    guarded_connections.each do |name, connection|
      handlers = connection.builder.handlers
      assert_operator handlers.index(Faraday::FollowRedirects::Middleware),
                      :<,
                      handlers.index(OutboundHttp::Guard),
                      "#{name} checks the first hop only"
    end
  end

  test "FeedFetcher refuses a feed URL that names a loopback address" do
    feed = Feed.new(feed_url: "http://127.0.0.1:5432/feed.xml")

    result = FeedFetcher.new(feed).fetch

    assert result.error?
    assert_not_requested :get, "http://127.0.0.1:5432/feed.xml"
  end

  test "ImageCacher refuses an image URL that names the metadata endpoint" do
    entry = entries(:basic)
    entry.update!(content: '<p><img src="http://169.254.169.254/latest/meta-data/"></p>')
    FileUtils.mkdir_p(Rails.configuration.x.image_cache.dir)

    result = ImageCacher.new(entry).cache_images

    assert_equal 0, result.cached_count
    assert_equal 1, result.failed_count
    assert_not_requested :get, "http://169.254.169.254/latest/meta-data/"
  end

  test "FaviconFetcher refuses a site URL that names a private address" do
    feed = Feed.new(site_url: "http://192.168.1.10")

    result = FaviconFetcher.new(feed).fetch

    assert result.error?
    assert_not_requested :get, "http://192.168.1.10/"
  end

  test "GoogleNewsRssFetcher refuses its endpoint when the name resolves internally" do
    with_dns("news.google.com" => "127.0.0.1") do
      assert_raises(GoogleNewsRssFetcher::FetchError) { GoogleNewsRssFetcher.new("query").fetch }
    end

    assert_not_requested :get, /news\.google\.com/
  end

  # A public host that answers 302 with an internal Location is the reason the
  # check cannot be a one-time look at the URL the caller passed.
  test "refuses an internal address reached through a redirect" do
    stub_request(:get, "https://example.com/feed.xml")
      .to_return(status: 302, headers: { "Location" => "http://127.0.0.1:5432/feed.xml" })

    result = FeedFetcher.new(Feed.new(feed_url: "https://example.com/feed.xml")).fetch

    assert result.error?
    assert_requested :get, "https://example.com/feed.xml"
    assert_not_requested :get, "http://127.0.0.1:5432/feed.xml"
  end

  test "ordinary public fetching is untouched" do
    stub_request(:get, "https://example.com/feed.xml").to_return(status: 200, body: "<rss/>")

    result = FeedFetcher.new(Feed.new(feed_url: "https://example.com/feed.xml")).fetch

    assert result.success?
    assert_equal "<rss/>", result.body
  end

  # Two lookups -- one to judge the name, one inside Net::HTTP to connect -- is
  # a name whose answer can change in between. The adapter connects to the
  # address the guard validated and leaves the hostname on the request.
  test "pins the socket to the validated address without rewriting the request" do
    env = Faraday::Env.new
    env.url = URI.parse("https://public.example/page")
    env.request = Faraday::RequestOptions.new
    env.request.context = { pinned_ip: "93.184.216.34" }

    http = OutboundHttp::PinnedNetHttp.new.build_connection(env)

    assert_equal "93.184.216.34", http.ipaddr
    assert_equal "public.example", http.address
  end

  test "leaves the socket unpinned when there is no validated address" do
    env = Faraday::Env.new
    env.url = URI.parse("https://public.example/page")
    env.request = Faraday::RequestOptions.new

    http = OutboundHttp::PinnedNetHttp.new.build_connection(env)

    assert_nil http.ipaddr
  end

  test "the guard records the address it validated for the adapter to pin" do
    env = Faraday::Env.new
    env.url = URI.parse("https://public.example/page")
    env.request = Faraday::RequestOptions.new
    inner = ->(passed) { passed }

    with_dns("public.example" => "93.184.216.34") do
      OutboundHttp::Guard.new(inner).call(env)
    end

    assert_equal "93.184.216.34", env[:request][:context][:pinned_ip]
  end
end
