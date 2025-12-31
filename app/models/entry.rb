# Represents an individual article or post from an RSS/Atom feed.
#
# Entries are the core content units in the feed reader. They are shared across
# users (via UserEntry join records) to avoid duplicating article content when
# multiple users subscribe to the same feed.
#
# Each entry has a globally unique GUID from the source feed and a content_hash
# for detecting updates. PostgreSQL full-text search is supported via a tsvector
# column that indexes title and content.
#
# @see UserEntry for per-user read state and interaction
# @see Enclosure for attached media (audio, video, images)
# @see Tag for user-applied classification
class Entry < ApplicationRecord
  has_many :user_entries, dependent: :destroy
  has_many :users, through: :user_entries
  has_many :enclosures, dependent: :destroy
  has_many :entry_tags, dependent: :destroy
  has_many :tags, through: :entry_tags
  has_many :cached_images, dependent: :destroy
  has_one :cached_audio, dependent: :destroy

  validates :guid, presence: true, uniqueness: true
  validates :title, presence: true
  validates :link, presence: true
  validates :content, presence: true
  validates :content_hash, presence: true

  scope :recent, -> { order(date_entered: :desc) }

  # Full-text search using PostgreSQL tsvector
  scope :search, ->(query) {
    return none if query.blank?

    sanitized = sanitize_sql_like(query)
    where("tsvector_combined @@ plainto_tsquery('english', ?)", sanitized)
      .order(Arel.sql("ts_rank(tsvector_combined, plainto_tsquery('english', #{connection.quote(sanitized)})) DESC"))
  }

  # Update tsvector when saving
  before_save :update_tsvector

  private

  def update_tsvector
    self.tsvector_combined = Entry.connection.execute(
      Entry.sanitize_sql([
        "SELECT to_tsvector('english', ?) || to_tsvector('english', ?)",
        title.to_s,
        ActionController::Base.helpers.strip_tags(content.to_s)
      ])
    ).first["to_tsvector"]
  end
end
