# A saved search that applies a tag automatically.
#
# A rule's scope is everywhere (no feed or category), one feed, or one
# category, never both. A tag may carry several rules, and an entry has the
# tag when any of them matches, so the same query saved from two feeds is a
# union.
#
# Each match is recorded as an EntryTagRuleMatch. An entry carries a tag iff
# it has a manual EntryTag row for it or at least one match for a rule of that
# tag; rule-applied EntryTag rows have manual: false and are removed once the
# last such match goes. Manual rows are never removed by rules.
#
# @see EntryTagRuleMatch for provenance
# @see Tag for the applied classification
class TagRule < ApplicationRecord
  belongs_to :user
  belongs_to :tag
  belongs_to :feed, optional: true
  belongs_to :category, optional: true
  has_many :entry_tag_rule_matches, dependent: :delete_all
  has_many :matched_entries, through: :entry_tag_rule_matches, source: :entry

  normalizes :query, with: ->(query) { query.strip }

  validates :query, presence: true
  validates :query, uniqueness: { scope: %i[tag_id feed_id category_id] }
  validate :single_scope

  private

  def single_scope
    return unless feed_id && category_id

    errors.add(:base, "A rule can apply to a feed or a category, not both")
  end
end
