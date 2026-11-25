require "test_helper"

class TagRuleTest < ActiveSupport::TestCase
  setup do
    @user = users(:one)
    @tag = @user.tags.create!(name: "ruby")
    @feed = feeds(:high_frequency)
    @category = @user.categories.create!(title: "Programming")
  end

  def rule(**attrs)
    @tag.tag_rules.new(user: @user, query: "ruby", **attrs)
  end

  test "applies everywhere, to one feed, or to one category" do
    assert rule.valid?
    assert rule(feed: @feed).valid?
    assert rule(category: @category).valid?
  end

  test "rejects a feed and a category together" do
    both = rule(feed: @feed, category: @category)

    assert_not both.valid?
    assert_includes both.errors[:base], "A rule can apply to a feed or a category, not both"
  end

  test "the database rejects a feed and a category together" do
    both = rule(feed: @feed, category: @category)

    assert_raises(ActiveRecord::StatementInvalid) { both.save!(validate: false) }
  end

  test "requires a query and strips surrounding space" do
    assert_not rule(query: "  ").valid?
    assert_equal "ruby rails", rule(query: "  ruby rails ").query
  end

  test "rejects a duplicate query in the same scope" do
    rule.save!
    rule(feed: @feed).save!

    assert_not rule.valid?
    assert_not rule(feed: @feed).valid?
  end

  test "allows the same query in a different scope or for a different tag" do
    rule.save!

    assert rule(feed: @feed).valid?
    assert rule(category: @category).valid?
    assert @user.tags.create!(name: "lang").tag_rules.new(user: @user, query: "ruby").valid?
  end

  test "the database treats an empty scope as equal for uniqueness" do
    rule.save!

    assert_raises(ActiveRecord::RecordNotUnique) { rule.save!(validate: false) }
  end

  test "destroying the tag removes its rules and their matches" do
    saved = rule(feed: @feed)
    saved.save!
    match = saved.entry_tag_rule_matches.create!(entry: entries(:basic))

    @tag.destroy

    assert_not TagRule.exists?(saved.id)
    assert_not EntryTagRuleMatch.exists?(match.id)
  end

  test "deleting a feed in the database removes rules scoped to it" do
    scoped = rule(feed: @feed)
    scoped.save!
    match = scoped.entry_tag_rule_matches.create!(entry: entries(:basic))

    Feed.where(id: @feed.id).delete_all

    assert_not TagRule.exists?(scoped.id)
    assert_not EntryTagRuleMatch.exists?(match.id)
  end

  test "deleting a category in the database removes rules scoped to it" do
    scoped = rule(category: @category)
    scoped.save!

    Category.where(id: @category.id).delete_all

    assert_not TagRule.exists?(scoped.id)
  end
end
