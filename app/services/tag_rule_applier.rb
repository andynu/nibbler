# Keeps rule-applied tags in step with the rules: records which rule matched
# which entry (EntryTagRuleMatch), adds an EntryTag with manual: false where a
# match has none, and removes a non-manual EntryTag once no match for a rule of
# its tag remains. Manual rows are never removed here.
#
# Matching is Entry.text_search_matches, the predicate search itself uses, over
# the user_entries the rule's scope covers. Entries are shared across users but
# rules and tags are not, so every match is read through the owner's own rows.
#
# @see TagRule for the invariant this maintains
class TagRuleApplier
  # Brings a rule's matches into line with its current query and scope over
  # the owner's whole history: adds what now matches, drops what no longer
  # does. +previous_tag_id+ is the tag the rule applied before an edit moved it
  # to another, whose rows may have lost their only support.
  #
  # @param rule [TagRule]
  # @param previous_tag_id [Integer, nil]
  def self.sync(rule, previous_tag_id: nil)
    matching = Entry.text_search_matches(rule.query)
                    .where(id: rule.user_entries.select(:entry_id))
                    .select(:id)

    TagRule.transaction do
      rule.entry_tag_rule_matches.where.not(entry_id: matching).delete_all
      record_matches(rule, matching)
      add_entry_tags(EntryTagRuleMatch.where(tag_rule_id: rule.id))
      prune(tag_ids: [ rule.tag_id, previous_tag_id ].compact.uniq)
    end
  end

  # Applies the owner's rules to one of their rows, adding and removing that
  # entry's matches. Used on arrival and whenever the entry's text changes.
  #
  # @param user_entry [UserEntry]
  def self.apply(user_entry)
    rules = TagRule.where(user_id: user_entry.user_id).includes(:category).to_a
    return if rules.empty?

    entry_id = user_entry.entry_id
    TagRule.transaction do
      rules.each do |rule|
        if rule.user_entries.exists?(user_entry.id) && Entry.text_search_matches(rule.query).exists?(entry_id)
          record_matches(rule, Entry.where(id: entry_id).select(:id))
        else
          rule.entry_tag_rule_matches.where(entry_id: entry_id).delete_all
        end
      end

      add_entry_tags(EntryTagRuleMatch.where(entry_id: entry_id, tag_rule_id: rules.map(&:id)))
      prune(tag_ids: rules.map(&:tag_id).uniq, entry_id: entry_id)
    end
  end

  # Applies every subscriber's rules to a shared entry whose text changed: a
  # fetched full text or an edit read by one reader changes what everyone's
  # rules see.
  #
  # @param entry [Entry]
  def self.reevaluate(entry)
    UserEntry.where(entry_id: entry.id, user_id: TagRule.select(:user_id)).find_each { |user_entry| apply(user_entry) }
  end

  # Deletes the non-manual EntryTag rows of these tags that no rule match
  # supports any longer.
  #
  # @param tag_ids [Array<Integer>]
  # @param entry_id [Integer, nil] limit to one entry
  def self.prune(tag_ids:, entry_id: nil)
    rows = EntryTag.where(manual: false, tag_id: tag_ids)
    rows = rows.where(entry_id: entry_id) if entry_id
    rows.where(<<~SQL.squish).delete_all
      NOT EXISTS (
        SELECT 1 FROM entry_tag_rule_matches
        JOIN tag_rules ON tag_rules.id = entry_tag_rule_matches.tag_rule_id
        WHERE entry_tag_rule_matches.entry_id = entry_tags.entry_id
          AND tag_rules.tag_id = entry_tags.tag_id
      )
    SQL
  end

  # One INSERT ... SELECT, so a backfill over years of history never brings the
  # ids into Ruby.
  def self.record_matches(rule, entry_ids)
    connection.exec_insert(<<~SQL.squish)
      INSERT INTO entry_tag_rule_matches (entry_id, tag_rule_id, created_at)
      SELECT matched.id, #{Integer(rule.id)}, CURRENT_TIMESTAMP FROM (#{entry_ids.to_sql}) matched
      ON CONFLICT (entry_id, tag_rule_id) DO NOTHING
    SQL
  end
  private_class_method :record_matches

  # An existing row, manual or not, is left as it is.
  def self.add_entry_tags(matches)
    connection.exec_insert(<<~SQL.squish)
      INSERT INTO entry_tags (entry_id, tag_id, manual)
      SELECT DISTINCT entry_tag_rule_matches.entry_id, tag_rules.tag_id, FALSE
      FROM (#{matches.select(:entry_id, :tag_rule_id).to_sql}) entry_tag_rule_matches
      JOIN tag_rules ON tag_rules.id = entry_tag_rule_matches.tag_rule_id
      ON CONFLICT (entry_id, tag_id) DO NOTHING
    SQL
  end
  private_class_method :add_entry_tags

  def self.connection
    ActiveRecord::Base.connection
  end
  private_class_method :connection
end
