require "test_helper"

class FeedTagConverterTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    @user = users(:one)
    @feed = feeds(:high_frequency)
    @entry = entries(:basic)
    @user.user_entries.create!(entry: @entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)
  end

  test "creates one feed-scoped rule per feed tag, named for the tag" do
    tag = @user.tags.create!(name: "hello")
    FeedTag.create!(feed: @feed, tag: tag)

    result = FeedTagConverter.convert

    assert_equal 1, result.created
    rule = tag.tag_rules.sole
    assert_equal [ @user.id, "hello", @feed.id, nil ], [ rule.user_id, rule.query, rule.feed_id, rule.category_id ]
  end

  test "queues the rule's backfill, which records matches" do
    tag = @user.tags.create!(name: "hello")
    FeedTag.create!(feed: @feed, tag: tag)

    perform_enqueued_jobs(only: ApplyTagRuleJob) { FeedTagConverter.convert }

    assert tag.tag_rules.sole.entry_tag_rule_matches.exists?(entry_id: @entry.id)
  end

  test "running it again creates nothing new" do
    tag = @user.tags.create!(name: "hello")
    FeedTag.create!(feed: @feed, tag: tag)
    FeedTagConverter.convert

    result = FeedTagConverter.convert

    assert_equal [ 0, 1 ], [ result.created, result.existing ]
    assert_equal 1, tag.tag_rules.count
  end

  test "an existing tag on an entry stays manual" do
    tag = @user.tags.create!(name: "hello")
    FeedTag.create!(feed: @feed, tag: tag)
    EntryTag.create!(entry: @entry, tag: tag)

    perform_enqueued_jobs(only: ApplyTagRuleJob) { FeedTagConverter.convert }

    assert EntryTag.find_by!(entry: @entry, tag: tag).manual
  end

  test "skips a feed tag whose name cannot be a query, and says why" do
    tag = @user.tags.create!(name: "-hello")
    FeedTag.create!(feed: @feed, tag: tag)

    result = FeedTagConverter.convert

    assert_equal 0, result.created
    assert_equal 1, result.skipped.size
    assert_match(/needs a word/, result.skipped.first.errors.join)
    assert_empty TagRule.all
  end
end
