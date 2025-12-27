require "test_helper"

class Api::V1::OpmlControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = users(:one)
    @valid_opml = <<~OPML
      <?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <head><title>My Feeds</title></head>
        <body>
          <outline text="Tech" title="Tech">
            <outline type="rss" text="TechCrunch" title="TechCrunch"
              xmlUrl="https://techcrunch.com/feed/"
              htmlUrl="https://techcrunch.com"/>
          </outline>
          <outline type="rss" text="Hacker News" title="Hacker News"
            xmlUrl="https://news.ycombinator.com/rss"
            htmlUrl="https://news.ycombinator.com"/>
        </body>
      </opml>
    OPML
  end

  test "preview does NOT create feeds (parse only)" do
    assert_no_difference [ "Feed.count", "Category.count" ] do
      post api_v1_preview_url,
        params: { file: fixture_file_upload_from_string(@valid_opml, "application/xml") }

      assert_response :success
    end
  end

  test "preview returns feed data for display" do
    post api_v1_preview_url,
      params: { file: fixture_file_upload_from_string(@valid_opml, "application/xml") }

    assert_response :success
    json = JSON.parse(response.body)

    assert_equal 2, json["total"]
    assert_equal 2, json["new_feeds"]
    assert_equal 0, json["existing_feeds"]
    assert_equal 2, json["feeds"].size

    feed_titles = json["feeds"].map { |f| f["title"] }
    assert_includes feed_titles, "TechCrunch"
    assert_includes feed_titles, "Hacker News"
  end

  test "preview marks existing feeds correctly" do
    # Create one feed first for the first user (which the test fallback uses)
    test_user = User.first
    test_user.feeds.create!(title: "Existing", feed_url: "https://news.ycombinator.com/rss")

    post api_v1_preview_url,
      params: { file: fixture_file_upload_from_string(@valid_opml, "application/xml") }

    assert_response :success
    json = JSON.parse(response.body)

    assert_equal 2, json["total"]
    assert_equal 1, json["new_feeds"]
    assert_equal 1, json["existing_feeds"]

    hn_feed = json["feeds"].find { |f| f["title"] == "Hacker News" }
    assert hn_feed["exists"]

    tc_feed = json["feeds"].find { |f| f["title"] == "TechCrunch" }
    assert_not tc_feed["exists"]
  end

  test "import creates feeds and categories" do
    assert_difference "Feed.count", 2 do
      assert_difference "Category.count", 1 do
        post api_v1_import_url,
          params: { file: fixture_file_upload_from_string(@valid_opml, "application/xml") }

        assert_response :success
      end
    end

    json = JSON.parse(response.body)
    assert json["success"]
    assert_equal 2, json["feeds_created"]
    assert_equal 1, json["categories_created"]
  end

  test "preview without file returns error" do
    post api_v1_preview_url

    assert_response :bad_request
    json = JSON.parse(response.body)
    assert_equal "No file provided", json["error"]
  end

  test "import without file returns error" do
    post api_v1_import_url

    assert_response :bad_request
    json = JSON.parse(response.body)
    assert_equal "No file provided", json["error"]
  end

  private

  def fixture_file_upload_from_string(content, content_type)
    file = Tempfile.new([ "opml", ".xml" ])
    file.write(content)
    file.rewind
    Rack::Test::UploadedFile.new(file.path, content_type)
  end
end
