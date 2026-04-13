require "test_helper"

class GoogleNewsRssFetcherTest < ActiveSupport::TestCase
  RSS_SAMPLE = <<~RSS.freeze
    <?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>"SEC crypto" - Google News</title>
        <item>
          <title>SEC charges firm over token sale</title>
          <link>https://news.google.com/rss/articles/abc123?oc=5</link>
          <pubDate>Mon, 13 Apr 2026 13:00:00 GMT</pubDate>
          <description>&lt;a href="..."&gt;SEC charges firm&lt;/a&gt;&lt;br&gt;Reuters</description>
          <source url="https://reuters.com">Reuters</source>
        </item>
        <item>
          <title>Crypto lobby responds</title>
          <link>https://news.google.com/rss/articles/def456?oc=5</link>
          <pubDate>Mon, 13 Apr 2026 14:15:00 GMT</pubDate>
          <description>Industry reactions</description>
          <source url="https://example.com">Example</source>
        </item>
      </channel>
    </rss>
  RSS

  test "builds a URL with escaped query and default params" do
    fetcher = GoogleNewsRssFetcher.new("SEC crypto regulation")

    assert_includes fetcher.url, "q=SEC%20crypto%20regulation"
    assert_includes fetcher.url, "hl=en-US"
    assert_includes fetcher.url, "gl=US"
    assert_includes fetcher.url, "ceid=US%3Aen"
    assert fetcher.url.start_with?("https://news.google.com/rss/search?")
  end

  test "fetches and parses items into Item structs" do
    fetcher = GoogleNewsRssFetcher.new("SEC crypto")
    stub_request(:get, /news\.google\.com/).to_return(
      status: 200,
      body: RSS_SAMPLE,
      headers: { "Content-Type" => "application/rss+xml" }
    )

    items = fetcher.fetch

    assert_equal 2, items.size
    first = items.first
    assert_equal "https://news.google.com/rss/articles/abc123?oc=5", first.url
    assert_equal "SEC charges firm over token sale", first.title
    assert_equal "Reuters", first.source
    assert_equal Time.utc(2026, 4, 13, 13, 0, 0), first.published_at
  end

  test "raises FetchError on non-2xx" do
    stub_request(:get, /news\.google\.com/).to_return(status: 503, body: "")

    assert_raises(GoogleNewsRssFetcher::FetchError) do
      GoogleNewsRssFetcher.new("anything").fetch
    end
  end

  test "raises FetchError on connection failure" do
    stub_request(:get, /news\.google\.com/).to_raise(Faraday::ConnectionFailed.new("refused"))

    assert_raises(GoogleNewsRssFetcher::FetchError) do
      GoogleNewsRssFetcher.new("anything").fetch
    end
  end

  test "skips items with no link" do
    rss = <<~RSS
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>No link here</title>
            <description>orphan</description>
          </item>
          <item>
            <title>Has link</title>
            <link>https://news.google.com/rss/articles/ok</link>
          </item>
        </channel>
      </rss>
    RSS
    stub_request(:get, /news\.google\.com/).to_return(status: 200, body: rss)

    items = GoogleNewsRssFetcher.new("q").fetch

    assert_equal 1, items.size
    assert_equal "https://news.google.com/rss/articles/ok", items.first.url
  end

  test "tolerates unparseable pubDate" do
    rss = <<~RSS
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Bad date</title>
            <link>https://news.google.com/rss/articles/x</link>
            <pubDate>not a date</pubDate>
          </item>
        </channel>
      </rss>
    RSS
    stub_request(:get, /news\.google\.com/).to_return(status: 200, body: rss)

    items = GoogleNewsRssFetcher.new("q").fetch

    assert_equal 1, items.size
    assert_nil items.first.published_at
  end
end
