require "test_helper"

class Api::V1::CategoriesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = sign_in(users(:one))
    @tech = @user.categories.create!(title: "Tech")
    @ruby = @user.categories.create!(title: "Ruby", parent: @tech)
  end

  test "update reparents a category under one that is not below it" do
    news = @user.categories.create!(title: "News")

    patch api_v1_category_url(news), params: { category: { parent_id: @tech.id } }, as: :json

    assert_response :success
    assert_equal @tech.id, news.reload.parent_id
  end

  test "update refuses a parent that is the category's own descendant" do
    patch api_v1_category_url(@tech), params: { category: { parent_id: @ruby.id } }, as: :json

    assert_response :unprocessable_entity
    assert_nil @tech.reload.parent_id
    assert_includes JSON.parse(response.body)["errors"],
      "Parent cannot be one of this category's own descendants"
  end

  test "update refuses a category as its own parent" do
    patch api_v1_category_url(@tech), params: { category: { parent_id: @tech.id } }, as: :json

    assert_response :unprocessable_entity
    assert_nil @tech.reload.parent_id
  end

  test "reorder moves a category and keeps its new position" do
    patch reorder_api_v1_category_url(@ruby), params: { order_id: 3, parent_id: nil }, as: :json

    assert_response :success
    assert_nil @ruby.reload.parent_id
    assert_equal 3, @ruby.order_id
  end

  test "create refuses a parent that belongs to another user" do
    theirs = users(:two).categories.create!(title: "Theirs")

    assert_no_difference -> { Category.count } do
      post api_v1_categories_url, params: { category: { title: "Mine", parent_id: theirs.id } }, as: :json
    end

    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body)["errors"], "Parent must be one of your own categories"
  end

  test "update refuses a parent that belongs to another user" do
    theirs = users(:two).categories.create!(title: "Theirs")

    patch api_v1_category_url(@tech), params: { category: { parent_id: theirs.id } }, as: :json

    assert_response :unprocessable_entity
    assert_nil @tech.reload.parent_id
  end

  test "reorder refuses a parent that belongs to another user" do
    theirs = users(:two).categories.create!(title: "Theirs")

    patch reorder_api_v1_category_url(@ruby),
      params: { order_id: 0, parent_id: theirs.id }, as: :json

    assert_response :unprocessable_entity
    assert_equal @tech.id, @ruby.reload.parent_id
  end

  test "reorder refuses a parent that is the category's own descendant" do
    patch reorder_api_v1_category_url(@tech),
      params: { order_id: 0, parent_id: @ruby.id }, as: :json

    assert_response :unprocessable_entity
    assert_nil @tech.reload.parent_id
  end

  test "index sums the unread counts of a category's own feeds" do
    a = create_feed(@tech)
    b = create_feed(@tech)
    child_feed = create_feed(@ruby)
    2.times { create_user_entry(a) }
    create_user_entry(b)
    create_user_entry(b, unread: false)
    create_user_entry(child_feed)

    get api_v1_categories_url, as: :json

    json = JSON.parse(response.body).index_by { |c| c["id"] }
    assert_equal 3, json[@tech.id]["unread_count"]
    assert_equal 2, json[@tech.id]["feed_count"]
    assert_equal 1, json[@ruby.id]["unread_count"]
  end

  test "index query count does not grow with the number of feeds" do
    create_user_entry(create_feed(@tech))
    get api_v1_categories_url, as: :json # warm schema and auth lookups
    before = sql_count { get api_v1_categories_url, as: :json }

    3.times { create_user_entry(create_feed(@tech)) }
    news = @user.categories.create!(title: "News")
    create_user_entry(create_feed(news))
    after = sql_count { get api_v1_categories_url, as: :json }

    assert_equal before, after
  end

  private

  def create_feed(category)
    @user.feeds.create!(title: "Feed", category: category,
      feed_url: "https://example.com/#{SecureRandom.hex(4)}.rss")
  end

  def create_user_entry(feed, unread: true)
    entry = Entry.create!(
      guid: "categories-entry-#{SecureRandom.uuid}",
      title: "Entry",
      link: "https://example.com/#{SecureRandom.hex(4)}",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: Time.current,
      date_entered: Time.current,
      date_updated: Time.current
    )
    @user.user_entries.create!(entry: entry, feed: feed, uuid: SecureRandom.uuid, unread: unread)
  end

  # SQL statements the block runs, leaving out schema lookups and cache hits.
  # The query cache outlives a request in tests, so it is emptied first or a
  # repeated request would read as zero queries.
  def sql_count(&block)
    ActiveRecord::Base.connection.clear_query_cache
    count = 0
    counter = ->(*, payload) { count += 1 unless payload[:name] == "SCHEMA" || payload[:cached] }
    ActiveSupport::Notifications.subscribed(counter, "sql.active_record", &block)
    count
  end
end
