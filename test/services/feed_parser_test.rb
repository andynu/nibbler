require "test_helper"

class FeedParserTest < ActiveSupport::TestCase
  def setup
    @feed_url = "https://example.com/feed.rss"
  end

  test "parses basic RSS feed" do
    rss = <<~RSS
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <link>https://example.com</link>
          <item>
            <title>Test Entry</title>
            <link>https://example.com/post1</link>
            <guid>post1</guid>
            <description>Test content</description>
          </item>
        </channel>
      </rss>
    RSS

    result = FeedParser.new(rss, feed_url: @feed_url).parse

    assert result.success?
    assert_equal "Test Feed", result.title
    assert_equal 1, result.entries.size
    assert_equal "https://example.com/post1", result.entries.first.link
  end

  test "entry with missing link uses guid if it looks like URL" do
    rss = <<~RSS
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <item>
            <title>Entry with URL guid</title>
            <guid isPermaLink="true">https://example.com/permalink</guid>
            <description>Content without link tag</description>
          </item>
        </channel>
      </rss>
    RSS

    result = FeedParser.new(rss, feed_url: @feed_url).parse

    assert result.success?
    assert_equal "https://example.com/permalink", result.entries.first.link
  end

  test "entry with missing link and non-URL guid returns nil link" do
    rss = <<~RSS
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <item>
            <title>Entry with non-URL guid</title>
            <guid>Buzzsprout-12345</guid>
            <description>Podcast entry without link</description>
          </item>
        </channel>
      </rss>
    RSS

    result = FeedParser.new(rss, feed_url: @feed_url).parse

    assert result.success?
    assert_nil result.entries.first.link
  end

  test "entry with empty link tag returns nil link" do
    rss = <<~RSS
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <item>
            <title>Entry with empty link</title>
            <link/>
            <guid>entry-1</guid>
            <description>Content</description>
          </item>
        </channel>
      </rss>
    RSS

    result = FeedParser.new(rss, feed_url: @feed_url).parse

    assert result.success?
    assert_nil result.entries.first.link
  end

  test "prefers explicit link over guid" do
    rss = <<~RSS
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <item>
            <title>Entry with both</title>
            <link>https://example.com/actual-link</link>
            <guid isPermaLink="true">https://example.com/guid-link</guid>
            <description>Content</description>
          </item>
        </channel>
      </rss>
    RSS

    result = FeedParser.new(rss, feed_url: @feed_url).parse

    assert result.success?
    assert_equal "https://example.com/actual-link", result.entries.first.link
  end

  test "reads an enclosure from a plain RSS 2.0 channel" do
    result = FeedParser.new(channel(item_with(ENCLOSURE)), feed_url: @feed_url).parse

    enclosure = only_enclosure(result)
    assert_equal "https://cdn.example.com/ep1.mp3", enclosure.url
    assert_equal "audio/mpeg", enclosure.type
    assert_equal "", enclosure.title
    assert_equal "12345", enclosure.length
  end

  test "reads an enclosure from a channel declaring the iTunes namespace" do
    rss = channel(item_with(ENCLOSURE), namespaces: ITUNES_NS)

    result = FeedParser.new(rss, feed_url: @feed_url).parse

    enclosure = only_enclosure(result)
    assert_equal "https://cdn.example.com/ep1.mp3", enclosure.url
    assert_equal "audio/mpeg", enclosure.type
  end

  test "reads an enclosure from a FeedBurner channel" do
    rss = channel(item_with(ENCLOSURE), namespaces: FEEDBURNER_NS)

    result = FeedParser.new(rss, feed_url: @feed_url).parse

    assert_equal "https://cdn.example.com/ep1.mp3", only_enclosure(result).url
  end

  test "reads every media:content element as its own enclosure" do
    media = <<~XML
      <media:content url="https://cdn.example.com/v1.mp4" type="video/mp4" fileSize="999">
        <media:title>Clip one</media:title>
      </media:content>
      <media:content url="https://cdn.example.com/v2.mp4" type="video/mp4" fileSize="1000"/>
    XML
    rss = channel(item_with(media), namespaces: MEDIA_NS)

    enclosures = FeedParser.new(rss, feed_url: @feed_url).parse.entries.first.enclosures

    assert_equal 2, enclosures.size
    assert_equal "https://cdn.example.com/v1.mp4", enclosures.first.url
    assert_equal "video/mp4", enclosures.first.type
    assert_equal "Clip one", enclosures.first.title
    assert_equal "999", enclosures.first.length
    assert_equal "https://cdn.example.com/v2.mp4", enclosures.second.url
    assert_equal "", enclosures.second.title
  end

  test "keeps an enclosure and a media:content from the same item" do
    media = %(<media:content url="https://cdn.example.com/v1.mp4" type="video/mp4"/>)
    rss = channel(item_with(ENCLOSURE + media), namespaces: MEDIA_NS)

    enclosures = FeedParser.new(rss, feed_url: @feed_url).parse.entries.first.enclosures

    assert_equal [ "https://cdn.example.com/ep1.mp3", "https://cdn.example.com/v1.mp4" ],
                 enclosures.map(&:url)
  end

  test "an attachment with no type is stored as an opaque binary" do
    rss = channel(item_with(%(<enclosure url="https://cdn.example.com/ep1.bin"/>)))

    assert_equal "application/octet-stream", only_enclosure(rss_parse(rss)).type
  end

  test "a media:content carrying no url is skipped" do
    media = %(<media:content type="video/mp4"><media:player url="https://example.com/p"/></media:content>)
    rss = channel(item_with(media), namespaces: MEDIA_NS)

    assert_empty rss_parse(rss).entries.first.enclosures
  end

  test "an item with no attachment has no enclosures" do
    assert_empty rss_parse(channel(item_with(""))).entries.first.enclosures
  end

  test "an item with no link falls back to its enclosure url" do
    rss = channel(<<~XML)
      <item>
        <title>Linkless</title>
        <guid>ep1</guid>
        #{ENCLOSURE}
      </item>
    XML

    assert_equal "https://cdn.example.com/ep1.mp3", rss_parse(rss).entries.first.link
  end

  private

  ENCLOSURE = %(<enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="12345"/>).freeze
  ITUNES_NS = %( xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd").freeze
  MEDIA_NS = %( xmlns:media="http://search.yahoo.com/mrss/").freeze
  FEEDBURNER_NS = %( xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0").freeze

  def rss_parse(rss)
    FeedParser.new(rss, feed_url: @feed_url).parse
  end

  def only_enclosure(result)
    enclosures = result.entries.first.enclosures
    assert_equal 1, enclosures.size
    enclosures.first
  end

  def item_with(attachments)
    <<~XML
      <item>
        <title>Ep</title>
        <link>https://example.com/ep1</link>
        <guid>ep1</guid>
        #{attachments}
      </item>
    XML
  end

  def channel(items, namespaces: "")
    <<~XML
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"#{namespaces}>
        <channel>
          <title>Test Feed</title>
          <link>https://example.com</link>
          #{items}
        </channel>
      </rss>
    XML
  end
end
