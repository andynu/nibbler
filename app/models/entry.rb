class Entry < ApplicationRecord
  has_many :user_entries, dependent: :destroy
  has_many :users, through: :user_entries
  has_many :enclosures, dependent: :destroy
  has_many :entry_labels, dependent: :destroy
  has_many :labels, through: :entry_labels

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
