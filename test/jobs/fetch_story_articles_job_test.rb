require "test_helper"

class FetchStoryArticlesJobTest < ActiveJob::TestCase
  setup do
    @story = stories(:active_story)
    # Clear any fixture articles so counts are meaningful
    @story.story_articles.delete_all
    # Eliminate inter-query sleep to keep tests fast
    @original_delay = FetchStoryArticlesJob.inter_query_delay
    FetchStoryArticlesJob.inter_query_delay = 0
  end

  teardown do
    FetchStoryArticlesJob.inter_query_delay = @original_delay
  end

  def stub_query(query, items:)
    xml = items.map do |item|
      <<~ITEM
        <item>
          <title>#{item[:title]}</title>
          <link>#{item[:url]}</link>
          <pubDate>#{item[:pub_date] || 'Mon, 13 Apr 2026 13:00:00 GMT'}</pubDate>
          <description>#{item[:snippet]}</description>
          <source url="https://src">#{item[:source]}</source>
        </item>
      ITEM
    end.join
    body = %(<?xml version="1.0"?><rss version="2.0"><channel>#{xml}</channel></rss>)
    encoded = Regexp.escape(query.gsub(" ", "%20"))
    stub_request(:get, %r{news\.google\.com/rss/search.*q=#{encoded}}).to_return(
      status: 200, body: body, headers: { "Content-Type" => "application/rss+xml" }
    )
  end

  test "creates new story_articles for each query result" do
    stub_query("SEC crypto regulation", items: [
      { url: "https://ex.com/1", title: "Article 1", snippet: "s1", source: "Ex" },
      { url: "https://ex.com/2", title: "Article 2", snippet: "s2", source: "Ex" }
    ])
    stub_query("crypto enforcement 2026", items: [
      { url: "https://ex.com/3", title: "Article 3", snippet: "s3", source: "Ex" }
    ])

    assert_difference -> { @story.story_articles.count }, 3 do
      FetchStoryArticlesJob.perform_now(@story.id)
    end

    urls = @story.story_articles.reload.pluck(:url)
    assert_includes urls, "https://ex.com/1"
    assert_includes urls, "https://ex.com/3"
  end

  test "dedups existing urls via uniqueness constraint" do
    @story.story_articles.create!(url: "https://ex.com/dup", title: "old", fetched_at: 1.day.ago)

    stub_query("SEC crypto regulation", items: [
      { url: "https://ex.com/dup", title: "dup again", snippet: "s", source: "Ex" },
      { url: "https://ex.com/new", title: "new", snippet: "s", source: "Ex" }
    ])
    stub_query("crypto enforcement 2026", items: [])

    assert_difference -> { @story.story_articles.count }, 1 do
      FetchStoryArticlesJob.perform_now(@story.id)
    end
  end

  test "continues to next query when one fails" do
    stub_request(:get, %r{q=SEC%20crypto%20regulation}).to_return(status: 503, body: "")
    stub_query("crypto enforcement 2026", items: [
      { url: "https://ex.com/still", title: "still", snippet: "s", source: "Ex" }
    ])

    assert_difference -> { @story.story_articles.count }, 1 do
      FetchStoryArticlesJob.perform_now(@story.id)
    end
  end

  test "skips concluded stories" do
    concluded = stories(:concluded_story)

    assert_no_difference -> { StoryArticle.where(story_id: concluded.id).count } do
      FetchStoryArticlesJob.perform_now(concluded.id)
    end
    # Also verifies no HTTP request was made (WebMock would raise otherwise)
  end

  test "returns early for stories with no queries" do
    @story.update!(queries: [])

    assert_no_difference -> { @story.story_articles.count } do
      FetchStoryArticlesJob.perform_now(@story.id)
    end
  end

  test "ignores missing story id" do
    assert_nothing_raised do
      FetchStoryArticlesJob.perform_now(0)
    end
  end
end
