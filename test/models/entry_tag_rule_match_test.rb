require "test_helper"

class EntryTagRuleMatchTest < ActiveSupport::TestCase
  setup do
    @user = users(:one)
    @tag = @user.tags.create!(name: "ruby")
    @rule = @tag.tag_rules.create!(user: @user, query: "ruby")
    @entry = entries(:basic)
  end

  test "records a rule matching an entry once" do
    @rule.entry_tag_rule_matches.create!(entry: @entry)

    duplicate = @rule.entry_tag_rule_matches.new(entry: @entry)
    assert_not duplicate.valid?
    assert_raises(ActiveRecord::RecordNotUnique) { duplicate.save!(validate: false) }
  end

  test "deleting the entry in the database removes its matches" do
    match = @rule.entry_tag_rule_matches.create!(entry: @entry)

    Entry.where(id: @entry.id).delete_all

    assert_not EntryTagRuleMatch.exists?(match.id)
  end

  test "deleting the rule in the database removes its matches" do
    match = @rule.entry_tag_rule_matches.create!(entry: @entry)

    TagRule.where(id: @rule.id).delete_all

    assert_not EntryTagRuleMatch.exists?(match.id)
  end

  test "destroying the entry removes its matches" do
    match = @rule.entry_tag_rule_matches.create!(entry: @entry)

    @entry.destroy

    assert_not EntryTagRuleMatch.exists?(match.id)
  end

  test "entry tags count as manual unless a rule applied them" do
    assert EntryTag.create!(entry: @entry, tag: @tag).manual
    assert_not EntryTag.create!(entry: entries(:with_images), tag: @tag, manual: false).manual
  end
end
