# Represents an RSS or Atom feed subscription.
#
# Feeds are the source of articles (entries) in the system. Each feed belongs to
# a user and optionally to a category for organization. Feeds support hierarchical
# structure through parent_feed relationships.
#
# The feed_url is unique per user, allowing different users to subscribe to the
# same feed independently. Feeds track their last update time to support polling
# for new content.
#
# @see Entry for individual articles from this feed
# @see Category for feed organization
# @see UserEntry for the per-user view of entries from this feed
class Feed < ApplicationRecord
  belongs_to :user
  belongs_to :category, optional: true
  belongs_to :parent_feed, class_name: "Feed", optional: true
  has_many :child_feeds, class_name: "Feed", foreign_key: :parent_feed_id, dependent: :nullify
  has_many :user_entries, dependent: :destroy
  has_many :entries, through: :user_entries

  validates :title, presence: true
  validates :feed_url, presence: true
  validates :feed_url, uniqueness: { scope: :user_id }

  scope :visible, -> { where(hidden: false) }
  scope :ordered, -> { order(:order_id, :title) }

  # Feeds that need updating based on their individual update_interval
  # If update_interval is 0, use the provided default (in minutes)
  scope :needs_update, ->(default_interval_minutes = 30) {
    where("last_updated IS NULL OR (
      CASE
        WHEN update_interval > 0 THEN last_updated < datetime('now', '-' || update_interval || ' minutes')
        ELSE last_updated < datetime('now', '-' || ? || ' minutes')
      END
    )", default_interval_minutes)
  }

  # Returns the effective update interval in minutes (respects per-feed override)
  def effective_update_interval(default_interval_minutes = 30)
    update_interval.positive? ? update_interval : default_interval_minutes
  end

  # Exponential backoff delays: 5min, 15min, 1hr, 4hr, 24hr (capped)
  BACKOFF_DELAYS = [5.minutes, 15.minutes, 1.hour, 4.hours, 24.hours].freeze

  # Apply exponential backoff, optionally using server's Retry-After
  def apply_backoff!(server_retry_after = nil)
    self.consecutive_failures += 1
    delay = BACKOFF_DELAYS[[consecutive_failures - 1, BACKOFF_DELAYS.length - 1].min]

    # Prefer server's Retry-After if provided and reasonable (under 48 hours)
    if server_retry_after.present? && server_retry_after < 48.hours.from_now
      self.retry_after = server_retry_after
    else
      self.retry_after = Time.current + delay
    end

    save!
  end

  # Reset backoff after successful fetch
  def reset_backoff!
    return if consecutive_failures.zero? && retry_after.nil?

    update!(consecutive_failures: 0, retry_after: nil)
  end

  # Whether the feed is currently in backoff period
  def in_backoff?
    retry_after.present? && retry_after > Time.current
  end
end
