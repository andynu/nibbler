# Records that a TagRule matched an entry, so removing or narrowing the rule
# removes only the tags it applied.
#
# @see TagRule for the rule
# @see EntryTag for the tag row the match supports
class EntryTagRuleMatch < ApplicationRecord
  belongs_to :entry
  belongs_to :tag_rule

  validates :tag_rule_id, uniqueness: { scope: :entry_id }
end
