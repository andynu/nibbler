class UserEntry < ApplicationRecord
  belongs_to :entry
  belongs_to :feed, optional: true
  belongs_to :user
  has_many :tags, dependent: :destroy

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
