require "test_helper"

class Api::V1::TagRulesControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @user = sign_in(users(:one))
    @tag = @user.tags.create!(name: "quokkas")
    @feed = feeds(:high_frequency)
    @category = @user.categories.create!(title: "Animals")
    feeds(:low_frequency).update!(category: @category)

    @in_high = entry_in(@feed, "Quokka sighting")
    @in_low = entry_in(feeds(:low_frequency), "Quokka census")

    @other = users(:two)
    @their_tag = @other.tags.create!(name: "theirs")
    @their_feed = @other.feeds.create!(title: "Theirs", feed_url: "https://example.com/theirs.rss")
    @their_category = @other.categories.create!(title: "Theirs")
  end

  test "index lists a tag's rules with scope name and match count" do
    everywhere = create_rule("quokka")
    in_feed = create_rule("quokka", feed: @feed)
    in_category = create_rule("census", category: @category)

    get api_v1_tag_rules_url(tag_id: @tag.id), as: :json

    assert_response :success
    json = JSON.parse(response.body).index_by { |rule| rule["id"] }
    assert_equal [ everywhere.id, in_feed.id, in_category.id ], JSON.parse(response.body).pluck("id")
    assert_equal [ "All feeds", 2 ], json[everywhere.id].values_at("scope_name", "match_count")
    assert_equal [ "High Frequency Feed", 1 ], json[in_feed.id].values_at("scope_name", "match_count")
    assert_equal [ "Animals", 1 ], json[in_category.id].values_at("scope_name", "match_count")
  end

  test "index refuses another user's tag" do
    get api_v1_tag_rules_url(tag_id: @their_tag.id), as: :json

    assert_response :not_found
  end

  test "preview counts what the rule would match without saving it" do
    get preview_api_v1_tag_rules_url, params: { query: "quokka" }
    assert_response :success
    assert_equal 2, JSON.parse(response.body)["match_count"]

    get preview_api_v1_tag_rules_url, params: { query: "quokka", feed_id: @feed.id }
    assert_equal 1, JSON.parse(response.body)["match_count"]

    get preview_api_v1_tag_rules_url, params: { query: "quokka", category_id: @category.id }
    assert_equal 1, JSON.parse(response.body)["match_count"]

    assert_equal 0, TagRule.count
  end

  test "preview refuses another user's feed or category" do
    get preview_api_v1_tag_rules_url, params: { query: "quokka", feed_id: @their_feed.id }
    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body)["errors"], "Feed must be one of yours"

    get preview_api_v1_tag_rules_url, params: { query: "quokka", category_id: @their_category.id }
    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body)["errors"], "Category must be one of yours"
  end

  test "preview explains a query that only excludes" do
    get preview_api_v1_tag_rules_url, params: { query: "-quokka" }

    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].first.start_with?("Query needs a word to match")
  end

  test "create with an existing tag saves the scope and tags matches in the background" do
    perform_enqueued_jobs do
      post api_v1_tag_rules_url, params: { tag_rule: { query: "quokka", feed_id: @feed.id, tag_id: @tag.id } }, as: :json
    end

    assert_response :created
    json = JSON.parse(response.body)
    rule = TagRule.find(json["id"])
    assert_equal [ @user.id, @tag.id, @feed.id, nil ], [ rule.user_id, rule.tag_id, rule.feed_id, rule.category_id ]
    assert_equal "High Frequency Feed", json["scope_name"]
    assert EntryTag.exists?(entry: @in_high, tag: @tag)
    assert_not EntryTag.exists?(entry: @in_low, tag: @tag)
  end

  test "create with a new tag name creates the tag" do
    assert_difference -> { @user.tags.count }, 1 do
      post api_v1_tag_rules_url, params: { tag_rule: { query: "quokka", category_id: @category.id, tag_name: " Marsupials " } }, as: :json
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal "Marsupials", json["tag_name"]
    assert_equal @category.id, json["category_id"]
  end

  test "create with a tag name that already exists reuses the tag, ignoring case" do
    assert_no_difference -> { Tag.count } do
      post api_v1_tag_rules_url, params: { tag_rule: { query: "quokka", tag_name: "Quokkas" } }, as: :json
    end

    assert_response :created
    assert_equal @tag.id, JSON.parse(response.body)["tag_id"]
  end

  test "a refused rule leaves no new tag behind" do
    assert_no_difference -> { Tag.count } do
      post api_v1_tag_rules_url, params: { tag_rule: { query: "-quokka", tag_name: "fresh tag" } }, as: :json
    end

    assert_response :unprocessable_entity
  end

  test "create refuses another user's tag, feed or category" do
    [
      { tag_id: @their_tag.id },
      { tag_id: @tag.id, feed_id: @their_feed.id },
      { tag_id: @tag.id, category_id: @their_category.id }
    ].each do |scope|
      assert_no_difference -> { TagRule.count } do
        post api_v1_tag_rules_url, params: { tag_rule: { query: "quokka", **scope } }, as: :json
      end
      assert_response :unprocessable_entity
      assert_match "must be one of yours", JSON.parse(response.body)["errors"].join
    end
  end

  test "update changes the query and refuses another user's feed" do
    rule = create_rule("quokka")

    patch api_v1_tag_rule_url(rule), params: { tag_rule: { query: "census" } }, as: :json
    assert_response :success
    assert_equal "census", rule.reload.query

    patch api_v1_tag_rule_url(rule), params: { tag_rule: { feed_id: @their_feed.id } }, as: :json
    assert_response :unprocessable_entity
    assert_nil rule.reload.feed_id
  end

  test "destroy deletes the rule and the tags only it applied" do
    rule = create_rule("quokka")
    assert EntryTag.exists?(entry: @in_high, tag: @tag)

    delete api_v1_tag_rule_url(rule), as: :json

    assert_response :no_content
    assert_not TagRule.exists?(rule.id)
    assert_not EntryTag.exists?(entry: @in_high, tag: @tag)
  end

  test "update and destroy cannot reach another user's rule" do
    theirs = @their_tag.tag_rules.create!(user: @other, query: "quokka")

    patch api_v1_tag_rule_url(theirs), params: { tag_rule: { query: "mine now" } }, as: :json
    assert_response :not_found

    delete api_v1_tag_rule_url(theirs), as: :json
    assert_response :not_found
    assert TagRule.exists?(theirs.id)
  end

  private

  def create_rule(query, feed: nil, category: nil)
    perform_enqueued_jobs do
      @tag.tag_rules.create!(user: @user, query: query, feed: feed, category: category)
    end
  end

  def entry_in(feed, title)
    entry = Entry.create!(
      guid: "rule-#{SecureRandom.uuid}", title: title, link: "https://example.com/#{SecureRandom.hex(4)}",
      content: "<p>#{title}</p>", content_hash: SecureRandom.hex(16), updated: Time.current,
      date_entered: Time.current, date_updated: Time.current
    )
    UserEntry.create!(uuid: SecureRandom.uuid, user: feed.user, feed: feed, entry: entry, unread: true)
    entry
  end
end
