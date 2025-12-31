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
