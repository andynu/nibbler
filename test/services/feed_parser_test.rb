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
end
