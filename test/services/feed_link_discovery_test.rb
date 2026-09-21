require "test_helper"

class FeedLinkDiscoveryTest < ActiveSupport::TestCase
  def setup
    @page_url = "https://example.com/blog"
  end

  def page(head)
    <<~HTML
      <!DOCTYPE html>
      <html>
        <head>#{head}</head>
        <body><p>Hello</p></body>
      </html>
    HTML
  end

  test "finds an RSS link" do
    html = page(%(<link rel="alternate" type="application/rss+xml" href="https://example.com/feed.xml">))

    assert_equal "https://example.com/feed.xml",
      FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "finds an Atom link" do
    html = page(%(<link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml">))

    assert_equal "https://example.com/atom.xml",
      FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "resolves a relative href against the page URL" do
    html = page(%(<link rel="alternate" type="application/rss+xml" href="/blog/rss.xml">))

    assert_equal "https://example.com/blog/rss.xml",
      FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "resolves a document-relative href against the page URL" do
    html = page(%(<link rel="alternate" type="application/rss+xml" href="feed.xml">))

    assert_equal "https://example.com/blog/feed.xml",
      FeedLinkDiscovery.new(html, page_url: "https://example.com/blog/index.html").feed_url
  end

  test "ignores a type parameter and letter case" do
    html = page(%(<link REL="Alternate" TYPE="application/RSS+XML; charset=utf-8" href="/feed.xml">))

    assert_equal "https://example.com/feed.xml",
      FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "accepts a multi-valued rel" do
    html = page(%(<link rel="alternate home" type="application/rss+xml" href="/feed.xml">))

    assert_equal "https://example.com/feed.xml",
      FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "ignores hreflang alternates" do
    html = page(<<~HEAD)
      <link rel="alternate" hreflang="ja" href="https://example.com/ja/blog">
      <link rel="alternate" hreflang="de" href="https://example.com/de/blog">
    HEAD

    assert_nil FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
    assert_empty FeedLinkDiscovery.new(html, page_url: @page_url).feed_urls
  end

  test "ignores a stylesheet alternate" do
    html = page(%(<link rel="alternate stylesheet" type="text/css" href="/dark.css">))

    assert_nil FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "ignores a rel the page did not mark alternate" do
    html = page(%(<link rel="preload" type="application/rss+xml" href="/feed.xml">))

    assert_nil FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "ignores a non-http href" do
    html = page(%(<link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">))

    assert_nil FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "ignores an href that is not a URL" do
    html = page(%(<link rel="alternate" type="application/rss+xml" href="http://[bad">))

    assert_nil FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end

  test "returns every linked feed in document order, without duplicates" do
    html = page(<<~HEAD)
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
      <link rel="alternate" type="application/atom+xml" href="/atom.xml">
      <link rel="alternate" type="application/rss+xml" href="https://example.com/feed.xml">
    HEAD

    discovery = FeedLinkDiscovery.new(html, page_url: @page_url)

    assert_equal [ "https://example.com/feed.xml", "https://example.com/atom.xml" ], discovery.feed_urls
    assert_equal "https://example.com/feed.xml", discovery.feed_url
  end

  test "a page with no feed link is still HTML" do
    discovery = FeedLinkDiscovery.new(page(""), page_url: @page_url)

    assert discovery.html?
    assert_nil discovery.feed_url
  end

  test "a body that is not HTML is not searched" do
    sitemap = <<~XML
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
      </urlset>
    XML

    discovery = FeedLinkDiscovery.new(sitemap, page_url: @page_url)

    assert_not discovery.html?
    assert_nil discovery.feed_url
  end

  test "an empty body is not HTML" do
    assert_not FeedLinkDiscovery.new("", page_url: @page_url).html?
    assert_not FeedLinkDiscovery.new(nil, page_url: @page_url).html?
  end

  test "HTML behind a comment or leading whitespace is still recognized" do
    link = %(<link rel="alternate" type="application/rss+xml" href="/feed.xml">)
    html = "\n<!-- generated -->\n<html><head>#{link}</head><body></body></html>"

    assert_equal "https://example.com/feed.xml",
      FeedLinkDiscovery.new(html, page_url: @page_url).feed_url
  end
end
