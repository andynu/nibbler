# Join model linking entries to tags.
#
# EntryTag provides the many-to-many relationship between Entry and Tag,
# allowing users to apply multiple tags to any entry and query entries
# by tag.
#
# +manual+ is false only on a row a TagRule applied; rules remove those once no
# match supports them, and never touch a manual one.
#
# @see Entry for the tagged article
# @see Tag for the classification applied
# @see TagRuleApplier for rule-applied rows
class EntryTag < ApplicationRecord
  belongs_to :tag
  belongs_to :entry

  # Tags the entry by hand. A row a rule applied becomes manual, so editing or
  # deleting the rule no longer removes it.
  def self.add_manual(entry:, tag:)
    entry_tag = find_or_initialize_by(entry: entry, tag: tag)
    entry_tag.update!(manual: true)
    entry_tag
  end

  # Removes the tag and the rule matches behind it. A rule that still matches
  # adds it back the next time it runs over this entry (an edit to the entry,
  # a fetched full text, or an edit to the rule); changing the rule is how to
  # keep it off.
  def self.remove(entry:, tag:)
    transaction do
      EntryTagRuleMatch.where(entry: entry, tag_rule_id: tag.tag_rules.select(:id)).delete_all
      where(entry: entry, tag: tag).destroy_all
    end
  end
end
