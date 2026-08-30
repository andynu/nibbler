# Represents an individual article or post from an RSS/Atom feed.
#
# Entries are the core content units in the feed reader. They are shared across
# users (via UserEntry join records) to avoid duplicating article content when
# multiple users subscribe to the same feed.
#
# Each entry has a globally unique GUID from the source feed and a content_hash
# for detecting updates. PostgreSQL full-text search is supported via
# tsvector_combined, a GENERATED ALWAYS ... STORED column that PostgreSQL
# computes from title and content (see the migration for the expression and for
# why it is not a Rails callback). Nothing in Ruby writes it, and no write path
# can skip it.
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
  validates :content_hash, presence: true

  # A body is optional. Headline-only and link-only items are a normal RSS
  # shape, not a malformed one: 20 of the 50 items in the Braintree, MA news
  # flash feed carry a title and a link and nothing else. Requiring presence
  # here rejected those items at ingest, which is the wrong half of the pair to
  # call invalid.
  #
  # nil is still rejected: the column is NOT NULL, so "" is the only acceptable
  # way to have no body.
  validates :content, exclusion: { in: [ nil ], message: "can't be nil" }

  scope :recent, -> { order(date_entered: :desc) }

  # Full-text search using PostgreSQL tsvector
  scope :search, ->(query) {
    return none if query.blank?

    sanitized = sanitize_sql_like(query)
    where("tsvector_combined @@ plainto_tsquery('english', ?)", sanitized)
      .order(Arel.sql("ts_rank(tsvector_combined, plainto_tsquery('english', #{connection.quote(sanitized)})) DESC"))
  }
end
