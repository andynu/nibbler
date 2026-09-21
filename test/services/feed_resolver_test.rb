require "test_helper"

class FeedResolverTest < ActiveSupport::TestCase
  test "a feed URL parses where it stands" do
    url = "https://example.com/feed.xml"
    stub_request(:get, url).to_return(status: 200, body: rss("Direct Feed"))

    result = FeedResolver.new(url).resolve

    assert result.success?
    assert_equal url, result.feed_url
    assert_equal "Direct Feed", result.parse_result.title
  end

  test "a page is resolved to the feed it links" do
    page_url = "https://example.com/blog"
    feed_url = "https://example.com/blog/rss.xml"

    stub_request(:get, page_url)
      .to_return(status: 200, body: page(%(<link rel="alternate" type="application/rss+xml" href="/blog/rss.xml">)))
    stub_request(:get, feed_url).to_return(status: 200, body: rss("Linked Feed"))

    result = FeedResolver.new(page_url).resolve

    assert result.success?
    assert_equal feed_url, result.feed_url
    assert_equal "Linked Feed", result.parse_result.title
  end

  test "a page that links no feed says so" do
    page_url = "https://example.com/blog"
    stub_request(:get, page_url).to_return(status: 200, body: page(""))

    result = FeedResolver.new(page_url).resolve

    assert_not result.success?
    assert_equal FeedResolver::NOT_A_FEED, result.error
  end

  test "a body that is neither feed nor page keeps the parser's error" do
    url = "https://example.com/sitemap.xml"
    sitemap = %(<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url></urlset>)

    stub_request(:get, url).to_return(status: 200, body: sitemap, headers: { "Content-Type" => "application/rss+xml" })

    result = FeedResolver.new(url).resolve

    assert_not result.success?
    assert_match(/no suitable parser/, result.error)
  end

  test "a fetch failure is reported as it stands" do
    url = "https://example.com/feed.xml"
    stub_request(:get, url).to_return(status: 404)

    result = FeedResolver.new(url).resolve

    assert_not result.success?
    assert_equal "Feed not found", result.error
  end

  test "a linked feed that cannot be fetched names itself" do
    page_url = "https://example.com/blog"
    feed_url = "https://example.com/blog/rss.xml"

    stub_request(:get, page_url)
      .to_return(status: 200, body: page(%(<link rel="alternate" type="application/rss+xml" href="/blog/rss.xml">)))
    stub_request(:get, feed_url).to_return(status: 404)

    result = FeedResolver.new(page_url).resolve

    assert_not result.success?
    assert_match feed_url, result.error
    assert_match(/Feed not found/, result.error)
  end

  test "a linked feed that is itself a page is not searched again" do
    page_url = "https://example.com/blog"
    linked_url = "https://example.com/blog/rss.xml"

    stub_request(:get, page_url)
      .to_return(status: 200, body: page(%(<link rel="alternate" type="application/rss+xml" href="/blog/rss.xml">)))
    stub_request(:get, linked_url)
      .to_return(status: 200, body: page(%(<link rel="alternate" type="application/rss+xml" href="/other.xml">)))

    result = FeedResolver.new(page_url).resolve

    assert_not result.success?
    assert_match linked_url, result.error
    assert_not_requested :get, "https://example.com/other.xml"
  end

  test "a page that links itself does not refetch itself" do
    page_url = "https://example.com/blog"

    stub_request(:get, page_url)
      .to_return(status: 200, body: page(%(<link rel="alternate" type="application/rss+xml" href="https://example.com/blog">)))

    result = FeedResolver.new(page_url).resolve

    assert_not result.success?
    assert_equal FeedResolver::NOT_A_FEED, result.error
    assert_requested :get, page_url, times: 1
  end

  private

  def page(head)
    "<!DOCTYPE html><html><head>#{head}</head><body><p>Hello</p></body></html>"
  end

  def rss(title)
    <<~XML
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>#{title}</title>
          <link>https://example.com</link>
          <description>Test feed</description>
          <item>
            <title>Sample Item</title>
            <link>https://example.com/item1</link>
            <description>Sample description</description>
          </item>
        </channel>
      </rss>
    XML
  end
end
