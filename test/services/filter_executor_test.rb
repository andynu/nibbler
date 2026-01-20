require "test_helper"

class FilterExecutorTest < ActiveSupport::TestCase
  setup do
    @user = users(:one)
    @feed = feeds(:high_frequency)
    @entry = Entry.create!(
      guid: "filter-test-entry-#{SecureRandom.uuid}",
      title: "Test Article About Technology",
      link: "https://example.com/tech-article",
      content: "<p>This is content about programming and code.</p>",
      content_hash: SecureRandom.hex(16),
      date_entered: Time.current,
      date_updated: Time.current,
      updated: Time.current
    )
    @user_entry = UserEntry.create!(
      uuid: SecureRandom.uuid,
      user: @user,
      feed: @feed,
      entry: @entry,
      unread: true,
      marked: false,
      published: false,
      score: 0
    )
  end

  teardown do
    # Clean up created test data
    @entry&.destroy
  end

  # ===================
  # AND Logic (match_any_rule: false)
  # ===================

  test "AND logic requires all rules to match" do
    filter = create_filter(match_any_rule: false)
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_rule(filter, filter_type: "content", reg_exp: "programming")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread
  end

  test "AND logic does not match when one rule fails" do
    filter = create_filter(match_any_rule: false)
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_rule(filter, filter_type: "content", reg_exp: "nonexistent")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.unread
  end

  # ===================
  # OR Logic (match_any_rule: true)
  # ===================

  test "OR logic matches when any rule matches" do
    filter = create_filter(match_any_rule: true)
    create_filter_rule(filter, filter_type: "title", reg_exp: "nonexistent")
    create_filter_rule(filter, filter_type: "content", reg_exp: "programming")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread
  end

  test "OR logic does not match when no rules match" do
    filter = create_filter(match_any_rule: true)
    create_filter_rule(filter, filter_type: "title", reg_exp: "nonexistent")
    create_filter_rule(filter, filter_type: "content", reg_exp: "also-nonexistent")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.unread
  end

  # ===================
  # Inverse Flag
  # ===================

  test "inverse flag negates match result - matches when rules dont match" do
    filter = create_filter(inverse: true)
    create_filter_rule(filter, filter_type: "title", reg_exp: "nonexistent")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread
  end

  test "inverse flag negates match result - does not match when rules match" do
    filter = create_filter(inverse: true)
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.unread
  end

  # ===================
  # Feed Scoping
  # ===================

  test "rule with feed_id only matches entries from that feed" do
    other_feed = feeds(:low_frequency)

    filter = create_filter
    rule = create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    rule.update!(feed: other_feed)
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.unread  # Did not match because feed is different
  end

  test "rule with feed_id matches when feed matches" do
    filter = create_filter
    rule = create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    rule.update!(feed: @feed)
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread
  end

  # ===================
  # Category Scoping
  # ===================

  test "rule with category_id only matches entries from feeds in that category" do
    category = Category.create!(user: @user, title: "Test Category")
    other_category = Category.create!(user: @user, title: "Other Category")
    @feed.update!(category: other_category)

    filter = create_filter
    rule = create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    rule.update!(category: category)
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.unread  # Did not match because category is different
  end

  test "rule with category_id matches when feed is in that category" do
    category = Category.create!(user: @user, title: "Test Category")
    @feed.update!(category: category)

    filter = create_filter
    rule = create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    rule.update!(category: category)
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread
  end

  # ===================
  # Actions: mark_read
  # ===================

  test "mark_read action marks entry as read" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "mark_read")

    assert @user_entry.unread

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread
  end

  # ===================
  # Actions: delete
  # ===================

  test "delete action destroys user_entry" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "delete")

    user_entry_id = @user_entry.id

    FilterExecutor.execute(@user_entry)

    assert_nil UserEntry.find_by(id: user_entry_id)
  end

  test "delete action stops processing subsequent filters" do
    filter1 = create_filter(order_id: 1)
    create_filter_rule(filter1, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter1, action_type: "delete")

    filter2 = create_filter(order_id: 2)
    create_filter_rule(filter2, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter2, action_type: "star")

    FilterExecutor.execute(@user_entry)

    # Entry was deleted, star action never ran
    assert_nil UserEntry.find_by(id: @user_entry.id)
  end

  # ===================
  # Actions: star
  # ===================

  test "star action marks entry as starred" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "star")

    assert_equal false, @user_entry.marked

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.marked
  end

  # ===================
  # Actions: publish
  # ===================

  test "publish action marks entry as published" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "publish")

    assert_equal false, @user_entry.published

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.published
  end

  # ===================
  # Actions: score
  # ===================

  test "score action adds to entry score" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "score", action_param: "5")

    assert_equal 0, @user_entry.score

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal 5, @user_entry.score
  end

  test "score action can subtract from entry score" do
    @user_entry.update!(score: 10)

    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "score", action_param: "-3")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal 7, @user_entry.score
  end

  # ===================
  # Actions: tag
  # ===================

  test "tag action creates and applies tag" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "tag", action_param: "tech")

    FilterExecutor.execute(@user_entry)

    @entry.reload
    assert_includes @entry.tags.pluck(:name), "tech"
    tag = @user.tags.find_by(name: "tech")
    assert tag.present?
  end

  test "tag action uses existing tag if present" do
    existing_tag = Tag.create!(user: @user, name: "tech", bg_color: "#ff0000", fg_color: "#ffffff")

    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "tag", action_param: "tech")

    FilterExecutor.execute(@user_entry)

    @entry.reload
    assert_includes @entry.tags, existing_tag
    assert_equal 1, @user.tags.where(name: "tech").count
  end

  test "tag action normalizes tag name to lowercase" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "tag", action_param: "UPPERCASE")

    FilterExecutor.execute(@user_entry)

    @entry.reload
    assert_includes @entry.tags.pluck(:name), "uppercase"
  end

  test "tag action does not duplicate existing tag on entry" do
    tag = Tag.create!(user: @user, name: "tech", bg_color: "#64748b", fg_color: "#ffffff")
    @entry.tags << tag

    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "tag", action_param: "tech")

    FilterExecutor.execute(@user_entry)

    @entry.reload
    assert_equal 1, @entry.tags.where(name: "tech").count
  end

  # ===================
  # Actions: stop
  # ===================

  test "stop action prevents subsequent filters from running" do
    filter1 = create_filter(order_id: 1)
    create_filter_rule(filter1, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter1, action_type: "mark_read")
    create_filter_action(filter1, action_type: "stop")

    filter2 = create_filter(order_id: 2)
    create_filter_rule(filter2, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter2, action_type: "star")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread  # First filter ran
    assert_equal false, @user_entry.marked  # Second filter did NOT run
  end

  test "filters run in order when no stop action" do
    filter1 = create_filter(order_id: 1)
    create_filter_rule(filter1, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter1, action_type: "mark_read")

    filter2 = create_filter(order_id: 2)
    create_filter_rule(filter2, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter2, action_type: "star")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread  # First filter ran
    assert_equal true, @user_entry.marked   # Second filter also ran
  end

  # ===================
  # Actions: ignore_tag
  # ===================

  test "ignore_tag action removes tag from entry" do
    tag = Tag.create!(user: @user, name: "removeme", bg_color: "#64748b", fg_color: "#ffffff")
    @entry.tags << tag

    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "ignore_tag", action_param: "removeme")

    assert_includes @entry.tags.pluck(:name), "removeme"

    FilterExecutor.execute(@user_entry)

    @entry.reload
    assert_not_includes @entry.tags.pluck(:name), "removeme"
  end

  test "ignore_tag action handles missing tag gracefully" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "ignore_tag", action_param: "nonexistent")

    # Should not raise an error
    assert_nothing_raised do
      FilterExecutor.execute(@user_entry)
    end
  end

  # ===================
  # Filter Timestamp Update
  # ===================

  test "updates filter last_triggered timestamp when filter matches" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "mark_read")

    assert_nil filter.last_triggered

    FilterExecutor.execute(@user_entry)

    filter.reload
    assert_not_nil filter.last_triggered
    assert_in_delta Time.current, filter.last_triggered, 5.seconds
  end

  test "does not update last_triggered when filter does not match" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "nonexistent")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    filter.reload
    assert_nil filter.last_triggered
  end

  # ===================
  # Empty/No Rules
  # ===================

  test "filter with no rules does not match" do
    filter = create_filter
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.unread
  end

  # ===================
  # Disabled Filters
  # ===================

  test "disabled filters are not executed" do
    filter = create_filter(enabled: false)
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal true, @user_entry.unread
  end

  # ===================
  # Multiple Actions on Same Filter
  # ===================

  test "multiple actions execute on same filter match" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "mark_read")
    create_filter_action(filter, action_type: "star")
    create_filter_action(filter, action_type: "score", action_param: "10")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread
    assert_equal true, @user_entry.marked
    assert_equal 10, @user_entry.score
  end

  # ===================
  # Class Method Interface
  # ===================

  test "class method execute works" do
    filter = create_filter
    create_filter_rule(filter, filter_type: "title", reg_exp: "Technology")
    create_filter_action(filter, action_type: "mark_read")

    FilterExecutor.execute(@user_entry)

    @user_entry.reload
    assert_equal false, @user_entry.unread
  end

  private

  def create_filter(match_any_rule: false, inverse: false, order_id: 0, enabled: true)
    Filter.create!(
      user: @user,
      title: "Test Filter #{SecureRandom.hex(4)}",
      match_any_rule: match_any_rule,
      inverse: inverse,
      order_id: order_id,
      enabled: enabled
    )
  end

  def create_filter_rule(filter, filter_type:, reg_exp:)
    FilterRule.create!(
      filter: filter,
      filter_type: filter_type,
      reg_exp: reg_exp
    )
  end

  def create_filter_action(filter, action_type:, action_param: "")
    FilterAction.create!(
      filter: filter,
      action_type: action_type,
      action_param: action_param
    )
  end
end
