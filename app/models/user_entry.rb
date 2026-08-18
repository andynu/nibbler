# Represents a user's view of a specific entry (article).
#
# UserEntry is the join model between User and Entry that tracks per-user state
# for each article: read/unread status, starred (marked), and published flags.
# This allows multiple users to have independent read states for shared entries.
#
# Each UserEntry has a UUID for external API references and belongs to the feed
# through which the user received the entry.
#
# @see Entry for the underlying article content
# @see Feed for the source subscription
# @see Tag for user-applied tags (attached at Entry level)
class UserEntry < ApplicationRecord
  belongs_to :entry
  belongs_to :feed, optional: true
  belongs_to :user

  validates :uuid, presence: true

  scope :unread, -> { where(unread: true) }
  scope :read, -> { where(unread: false) }
  scope :starred, -> { where(marked: true) }
  scope :published, -> { where(published: true) }
  scope :recent, -> { joins(:entry).order("entries.date_entered DESC") }

  # The Fresh virtual folder: unread articles published (entries.updated) since
  # the cutoff. Publication date is used rather than date_entered so a backlog
  # imported today does not read as fresh. A nil cutoff drops the age limit,
  # which is what the "all" max-age option asks for.
  #
  # This is the single definition of "fresh" - counters, entry lists and
  # headlines all go through it so the sidebar badge and the list agree.
  scope :fresh, ->(cutoff) {
    scoped = unread.joins(:entry)
    cutoff ? scoped.where("entries.updated > ?", cutoff) : scoped
  }

  # Ids from +relation+ that survive the Fresh view's per-feed cap: the newest
  # +limit+ articles of each feed. Newest means most recently published
  # (entries.updated), the same clock the +fresh+ scope uses to decide a feed's
  # articles are fresh at all - ranking by import date instead would let a
  # backlog imported today outrank an article published today. Import date and
  # then id break ties, so feeds that stamp every article with the same
  # publication date still get a stable, newest-first answer. Feeds with fewer
  # than +limit+ articles keep all of them.
  def self.top_per_feed_ids(relation, limit)
    base_ids = relation.reorder("").pluck(:id)
    return base_ids if base_ids.empty?

    limited_ids_sql = sanitize_sql_array([ <<~SQL.squish, base_ids, limit.to_i ])
      SELECT id FROM (
        SELECT user_entries.id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_entries.feed_id
                 ORDER BY entries.updated DESC, entries.date_entered DESC, user_entries.id DESC
               ) as rn
        FROM user_entries
        INNER JOIN entries ON entries.id = user_entries.entry_id
        WHERE user_entries.id IN (?)
      ) ranked
      WHERE rn <= ?
    SQL

    connection.select_values(limited_ids_sql)
  end

  # How many rows of +relation+ survive that same per-feed cap. The cap keeps
  # min(rows_in_feed, limit) rows from every feed regardless of how they rank
  # within it, so a grouped count gives the exact figure in one query without
  # materialising the ids. Counters use this to keep the Fresh badge equal to
  # the number of rows the Fresh list will show.
  def self.count_per_feed_capped(relation, limit)
    capped = limit.to_i
    relation.group(:feed_id).count.sum { |_feed_id, rows| [ rows, capped ].min }
  end

  def mark_read!
    update!(unread: false, last_read: Time.current)
  end

  def mark_unread!
    update!(unread: true)
  end

  def toggle_starred!
    update!(marked: !marked, last_marked: marked ? nil : Time.current)
  end

  def toggle_published!
    update!(published: !published, last_published: published ? nil : Time.current)
  end
end
