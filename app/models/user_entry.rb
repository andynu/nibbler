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
