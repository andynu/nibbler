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
  has_many :feed_tags, dependent: :destroy
  has_many :tags, through: :feed_tags

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
        WHEN update_interval > 0 THEN last_updated < NOW() - (update_interval || ' minutes')::interval
        ELSE last_updated < NOW() - (? || ' minutes')::interval
      END
    )", default_interval_minutes)
  }

  # Returns the effective update interval in minutes (respects per-feed override)
  def effective_update_interval(default_interval_minutes = 30)
    update_interval.positive? ? update_interval : default_interval_minutes
  end

  # Exponential backoff delays: 5min, 15min, 1hr, 4hr, 24hr (capped)
  BACKOFF_DELAYS = [ 5.minutes, 15.minutes, 1.hour, 4.hours, 24.hours ].freeze

  # Adaptive polling interval bounds (in seconds)
  MIN_POLL_INTERVAL = 5.minutes.to_i
  MAX_POLL_INTERVAL = 7.days.to_i  # Support weekly/monthly feeds
  DEFAULT_NEW_FEED_INTERVAL = 15.minutes.to_i

  # Number of days to consider for rolling average of posts per day
  ROLLING_AVERAGE_DAYS = 30

  # Apply exponential backoff, optionally using server's Retry-After
  def apply_backoff!(server_retry_after = nil)
    self.consecutive_failures += 1
    delay = BACKOFF_DELAYS[[ consecutive_failures - 1, BACKOFF_DELAYS.length - 1 ].min]

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

  # Refresh cached entry statistics (count and date range)
  # Call after entries are added, updated, or removed
  def refresh_entry_stats!
    stats = entries.reorder(nil).pick(
      Arel.sql("COUNT(*), MIN(entries.updated), MAX(entries.updated)")
    )

    update!(
      entry_count: stats[0] || 0,
      oldest_entry_date: stats[1],
      newest_entry_date: stats[2]
    )
  end

  # Calculate and update adaptive polling statistics after entries are processed
  # @param new_entries_count [Integer] number of new entries added this update
  def update_polling_stats!(new_entries_count)
    updates = {}

    if new_entries_count > 0
      updates[:last_new_entry_at] = Time.current

      # Recalculate average posts per day based on recent entry dates
      updates[:avg_posts_per_day] = calculate_avg_posts_per_day
    end

    # Calculate optimal interval based on publication frequency
    updates[:calculated_interval_seconds] = calculate_optimal_interval(
      updates[:avg_posts_per_day] || avg_posts_per_day
    )

    # Set next poll time (respects manual override if set)
    updates[:next_poll_at] = Time.current + effective_poll_interval_seconds(
      updates[:calculated_interval_seconds]
    )

    update!(updates)
  end

  # Get the effective poll interval in seconds
  # Respects manual update_interval override if set
  def effective_poll_interval_seconds(calculated = nil)
    # Manual override takes precedence (update_interval is in minutes)
    if update_interval.positive?
      return update_interval.minutes.to_i
    end

    calculated || calculated_interval_seconds || DEFAULT_NEW_FEED_INTERVAL
  end

  private

  # Calculate average posts per day based on recent entries
  def calculate_avg_posts_per_day
    cutoff = ROLLING_AVERAGE_DAYS.days.ago

    # Count entries from this feed in the rolling window
    entry_count = user_entries
      .joins(:entry)
      .where("entries.updated >= ?", cutoff)
      .count

    # Avoid division by zero, return small value for feeds with no recent entries
    return 0.01 if entry_count.zero?

    entry_count.to_f / ROLLING_AVERAGE_DAYS
  end

  # Calculate optimal polling interval based on posts per day
  # Higher frequency = shorter interval
  def calculate_optimal_interval(posts_per_day)
    return MAX_POLL_INTERVAL if posts_per_day <= 0.01

    # Target: check roughly 2x as often as posts arrive (to catch updates promptly)
    # posts_per_day = N means N posts in 24 hours
    # Ideal interval = 24 hours / (2 * N) = 12 hours / N
    ideal_seconds = (12.hours.to_i / posts_per_day).to_i

    # Clamp to reasonable bounds
    ideal_seconds.clamp(MIN_POLL_INTERVAL, MAX_POLL_INTERVAL)
  end
end
