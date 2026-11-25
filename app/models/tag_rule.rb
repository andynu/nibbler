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

  after_commit :apply_to_history, on: %i[create update], if: :matching_changed?
  # Matches are gone by now (dependent: :delete_all runs before the row goes),
  # so pruning leaves only the tag rows another rule or a person still supports.
  after_destroy { TagRuleApplier.prune(tag_ids: [ tag_id ]) }

  # The owner's rows this rule ranges over. A category stands for its whole
  # subtree, as it does for the sidebar and for a search narrowed to it, so the
  # rule tags what that search showed.
  #
  # @return [ActiveRecord::Relation<UserEntry>]
  def user_entries
    scope = UserEntry.where(user_id: user_id)
    return scope.where(feed_id: feed_id) if feed_id
    return scope.joins(:feed).where(feeds: { category_id: category.self_and_descendant_ids }) if category_id

    scope
  end

  private

  def matching_changed?
    %w[query feed_id category_id tag_id].any? { |attribute| saved_change_to_attribute?(attribute) }
  end

  # Whole history, so off the request: a rule saved from an "everywhere" search
  # reads every article the owner has.
  def apply_to_history
    ApplyTagRuleJob.perform_later(id, previous_tag_id: saved_change_to_tag_id&.first)
  end

  def single_scope
    return unless feed_id && category_id

    errors.add(:base, "A rule can apply to a feed or a category, not both")
  end
end
