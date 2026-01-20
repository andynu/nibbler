require "test_helper"

class Api::V1::FeedsControllerTest < ActionDispatch::IntegrationTest
  def setup
    # ALLOW_DEV_AUTH uses User.first, so we use that for consistency
    @user = User.first
    # Get a feed belonging to this user
    @feed = @user.feeds.first || @user.feeds.create!(
      title: "Test Feed",
      feed_url: "https://example.com/test-#{SecureRandom.hex(4)}.rss"
    )
  end

  # Index
  test "index returns all feeds for current user" do
    get api_v1_feeds_url, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_kind_of Array, json
    assert json.any? { |f| f["id"].present? && f["title"].present? }
  end

  # Show
  test "show returns feed details" do
    get api_v1_feed_url(@feed), as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal @feed.id, json["id"]
    assert_equal @feed.title, json["title"]
  end

  test "show returns 404 for non-existent feed" do
    get api_v1_feed_url(id: 999999), as: :json
    assert_response :not_found
  end

  # Create
  test "create with title succeeds" do
    feed_url = "https://example.com/new-feed-#{SecureRandom.hex(4)}.rss"

    # Stub the feed update that happens after creation
    stub_request(:get, feed_url)
      .to_return(
        status: 200,
        body: sample_rss_feed("My New Feed"),
        headers: { "Content-Type" => "application/rss+xml" }
      )

    assert_difference "Feed.count", 1 do
      post api_v1_feeds_url, params: {
        feed: {
          title: "My New Feed",
          feed_url: feed_url
        }
      }, as: :json
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal "My New Feed", json["title"]
    assert_equal feed_url, json["feed_url"]
  end

  test "create without title auto-detects from feed" do
    feed_url = "https://auto-detect.example.com/feed.atom"

    # Stub the feed fetch
    stub_request(:get, feed_url)
      .to_return(
        status: 200,
        body: sample_atom_feed("Auto-Detected Title"),
        headers: { "Content-Type" => "application/atom+xml" }
      )

    assert_difference "Feed.count", 1 do
      post api_v1_feeds_url, params: {
        feed: { feed_url: feed_url }
      }, as: :json
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal "Auto-Detected Title", json["title"]
  end

  test "create without title returns error when feed cannot be fetched" do
    feed_url = "https://unreachable.example.com/feed.rss"

    stub_request(:get, feed_url)
      .to_return(status: 500, body: "Internal Server Error")

    assert_no_difference "Feed.count" do
      post api_v1_feeds_url, params: {
        feed: { feed_url: feed_url }
      }, as: :json
    end

    assert_response :unprocessable_entity
    json = JSON.parse(response.body)
    assert json["error"].present?
    assert json["title_required"]
  end

  test "create without title returns error when feed cannot be parsed" do
    feed_url = "https://not-a-feed.example.com/page.html"

    stub_request(:get, feed_url)
      .to_return(
        status: 200,
        body: "<html><body>Not a feed</body></html>",
        headers: { "Content-Type" => "text/html" }
      )

    assert_no_difference "Feed.count" do
      post api_v1_feeds_url, params: {
        feed: { feed_url: feed_url }
      }, as: :json
    end

    assert_response :unprocessable_entity
    json = JSON.parse(response.body)
    assert json["error"].present?
    assert json["title_required"]
  end

  test "create rejects duplicate feed_url for same user" do
    assert_no_difference "Feed.count" do
      post api_v1_feeds_url, params: {
        feed: {
          title: "Duplicate Feed",
          feed_url: @feed.feed_url
        }
      }, as: :json
    end

    assert_response :unprocessable_entity
  end

  # Update
  test "update changes feed attributes" do
    patch api_v1_feed_url(@feed), params: {
      feed: { title: "Updated Title" }
    }, as: :json

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "Updated Title", json["title"]

    @feed.reload
    assert_equal "Updated Title", @feed.title
  end

  test "update returns 404 for non-existent feed" do
    patch api_v1_feed_url(id: 999999), params: {
      feed: { title: "Won't Work" }
    }, as: :json

    assert_response :not_found
  end

  # Delete
  test "delete removes feed" do
    feed_to_delete = @user.feeds.create!(
      title: "To Be Deleted",
      feed_url: "https://example.com/delete-me-#{SecureRandom.hex(4)}.rss"
    )

    assert_difference "Feed.count", -1 do
      delete api_v1_feed_url(feed_to_delete), as: :json
    end

    assert_response :no_content
  end

  # Refresh
  test "refresh updates feed" do
    stub_request(:get, @feed.feed_url)
      .to_return(
        status: 200,
        body: sample_rss_feed("Test Feed"),
        headers: { "Content-Type" => "application/rss+xml" }
      )

    post refresh_api_v1_feed_url(@feed), as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert json.key?("status")
    assert json.key?("new_entries")
  end

  # Preview
  test "preview returns feed metadata without subscribing" do
    preview_url = "https://preview.example.com/feed.atom"

    stub_request(:get, preview_url)
      .to_return(
        status: 200,
        body: sample_atom_feed("Preview Feed Title"),
        headers: { "Content-Type" => "application/atom+xml" }
      )

    assert_no_difference "Feed.count" do
      post preview_api_v1_feeds_url, params: { url: preview_url }, as: :json
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "Preview Feed Title", json["title"]
    assert_equal preview_url, json["feed_url"]
  end

  test "preview returns error for empty URL" do
    post preview_api_v1_feeds_url, params: { url: "" }, as: :json

    assert_response :bad_request
    json = JSON.parse(response.body)
    assert json["error"].include?("URL is required")
  end

  test "preview returns error for unreachable feed" do
    preview_url = "https://unreachable-preview.example.com/feed.rss"

    stub_request(:get, preview_url).to_timeout

    post preview_api_v1_feeds_url, params: { url: preview_url }, as: :json

    assert_response :unprocessable_entity
    json = JSON.parse(response.body)
    assert json["error"].present?
  end

  private

  def sample_atom_feed(title)
    <<~XML
      <?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>#{title}</title>
        <link href="https://example.com"/>
        <updated>2026-01-20T12:00:00Z</updated>
        <entry>
          <title>Sample Entry</title>
          <link href="https://example.com/entry1"/>
          <id>entry-1</id>
          <updated>2026-01-20T12:00:00Z</updated>
          <content>Sample content</content>
        </entry>
      </feed>
    XML
  end

  def sample_rss_feed(title)
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
            <pubDate>Mon, 20 Jan 2026 12:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    XML
  end
end
