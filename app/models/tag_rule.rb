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
  validate :owned_by_user
  validate :query_has_a_word

  after_commit :apply_to_history, on: %i[create update], if: :matching_changed?
  # Matches are gone by now (dependent: :delete_all runs before the row goes),
  # so pruning leaves only the tag rows another rule or a person still supports.
  after_destroy { TagRuleApplier.prune(tag_ids: [ tag_id ]) }

  # The rule that tags a feed's articles mentioning the tag's own name: what a
  # feed tag did before rules, and what tagging an article by hand still sets
  # up for its feed. Returns the existing rule when there is one; an unsaved
  # rule carries the errors when the name cannot be a query.
  #
  # @return [TagRule]
  def self.watch_feed(tag:, feed:)
    find_or_create_by(user_id: tag.user_id, tag: tag, query: tag.name, feed: feed, category_id: nil)
  end

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

  # The entries this rule matches today: search's own predicate over the rows
  # the scope covers, so a rule tags exactly what the search it was saved from
  # showed.
  #
  # @return [ActiveRecord::Relation<Entry>]
  def matching_entries
    Entry.text_search_matches(query).where(id: user_entries.select(:entry_id))
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

  # Tags, feeds and categories are per user, and a rule reaches the owner's
  # entries through all three, so a rule may only name the owner's own.
  def owned_by_user
    { tag: tag, feed: feed, category: category }.each do |attribute, record|
      next if record.nil? && self[:"#{attribute}_id"].nil?
      next if record&.user_id == user_id

      errors.add(attribute, "must be one of yours")
    end
  end

  # "-term" alone matches nothing through search's predicate, so a rule made
  # of it would never tag anything.
  def query_has_a_word
    return unless query.present? && Entry.excludes_only?(query)

    errors.add(:query, 'needs a word to match. "-term" on its own only says what to leave out.')
  end
end
