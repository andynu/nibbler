require "test_helper"

class OpmlImporterTest < ActiveSupport::TestCase
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

  test "parse returns feeds without creating database records" do
    importer = OpmlImporter.new(@user, @valid_opml)

    assert_no_difference [ "Feed.count", "Category.count" ] do
      result = importer.parse
      assert result.success?
      assert_equal 2, result.feeds.size
    end
  end

  test "parse populates feed data correctly" do
    importer = OpmlImporter.new(@user, @valid_opml)
    result = importer.parse

    tech_feed = result.feeds.find { |f| f.title == "TechCrunch" }
    assert_not_nil tech_feed
    assert_equal "https://techcrunch.com/feed/", tech_feed.feed_url
    assert_equal "https://techcrunch.com", tech_feed.site_url
    assert_equal [ "Tech" ], tech_feed.category_path

    hn_feed = result.feeds.find { |f| f.title == "Hacker News" }
    assert_not_nil hn_feed
    assert_equal "https://news.ycombinator.com/rss", hn_feed.feed_url
    assert_equal [], hn_feed.category_path
  end

  test "parse handles invalid XML" do
    importer = OpmlImporter.new(@user, "not valid xml <<<<")
    result = importer.parse

    # Nokogiri doesn't raise for invalid XML by default, just records errors
    # The parser will see no body element, which is handled
    assert_not result.success?
    assert result.errors.any?
  end

  test "parse handles missing body element" do
    opml = <<~OPML
      <?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <head><title>No Body</title></head>
      </opml>
    OPML
    importer = OpmlImporter.new(@user, opml)
    result = importer.parse

    assert_not result.success?
    assert_includes result.errors, "Invalid OPML: no body element found"
  end

  test "import creates feeds and categories in database" do
    importer = OpmlImporter.new(@user, @valid_opml)

    assert_difference "Feed.count", 2 do
      assert_difference "Category.count", 1 do
        result = importer.import
        assert result.success?
        assert_equal 2, result.feeds_created
        assert_equal 1, result.categories_created
      end
    end
  end

  test "import skips existing feeds" do
    # Create one feed first
    @user.feeds.create!(title: "Existing", feed_url: "https://news.ycombinator.com/rss")

    importer = OpmlImporter.new(@user, @valid_opml)

    assert_difference "Feed.count", 1 do
      result = importer.import
      assert result.success?
      assert_equal 1, result.feeds_created
      assert_equal 1, result.feeds_skipped
    end
  end

  test "parse does not affect subsequent import" do
    importer = OpmlImporter.new(@user, @valid_opml)

    # First parse (should not create anything)
    assert_no_difference [ "Feed.count", "Category.count" ] do
      importer.parse
    end

    # Then import (should create everything)
    assert_difference "Feed.count", 2 do
      assert_difference "Category.count", 1 do
        importer.import
      end
    end
  end
end
