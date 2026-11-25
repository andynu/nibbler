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

  test "rejects another user's tag, feed or category" do
    other = users(:two)
    their_tag = other.tags.create!(name: "theirs")
    their_feed = other.feeds.create!(title: "Theirs", feed_url: "https://example.com/theirs.rss")
    their_category = other.categories.create!(title: "Theirs")

    foreign_tag = their_tag.tag_rules.new(user: @user, query: "ruby")
    foreign_feed = rule(feed: their_feed)
    foreign_category = rule(category: their_category)

    assert_not foreign_tag.valid?
    assert_includes foreign_tag.errors[:tag], "must be one of yours"
    assert_not foreign_feed.valid?
    assert_includes foreign_feed.errors[:feed], "must be one of yours"
    assert_not foreign_category.valid?
    assert_includes foreign_category.errors[:category], "must be one of yours"
  end

  test "rejects a query that only excludes" do
    excluding = rule(query: "-wombat")

    assert_not excluding.valid?
    assert excluding.errors[:query].any? { |message| message.start_with?("needs a word to match") }
  end

  test "matching_entries counts what the rule's search would show" do
    feed_entry = Entry.create!(guid: "m-#{SecureRandom.uuid}", title: "Ruby gems", link: "https://example.com/m1",
                               content: "<p>gems</p>", content_hash: SecureRandom.hex(16), updated: Time.current,
                               date_entered: Time.current, date_updated: Time.current)
    UserEntry.create!(uuid: SecureRandom.uuid, user: @user, feed: @feed, entry: feed_entry, unread: true)

    assert_includes rule(feed: @feed).matching_entries, feed_entry
    assert_not_includes rule(feed: feeds(:low_frequency)).matching_entries, feed_entry
  end

  test "deleting a category in the database removes rules scoped to it" do
    scoped = rule(category: @category)
    scoped.save!

    Category.where(id: @category.id).delete_all

    assert_not TagRule.exists?(scoped.id)
  end
end
