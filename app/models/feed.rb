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

  # Editing the URL is the reader saying "I fixed it". The failing streak was
  # about the old address and says nothing about the new one, so carrying it
  # over would leave a corrected feed still marked broken and still parked hours
  # out on the backoff curve it earned before the edit. Clearing next_poll_at
  # drops the feed back onto the legacy due check, which makes it due at once.
  #
  # before_update rather than before_save: on create there is no streak to clear
  # and no next_poll_at worth stomping.
  before_update :clear_failure_state_on_url_change

  # How long after last_update_started a feed still counts as mid-update.
  #
  # Must stay well under the 5-minute scheduler cron period. At exactly 5
  # minutes the guard beat against the cron: a feed polled at 22:05:02 was
  # still "updating" to the run at 22:10:00, so that run enqueued nothing and
  # roughly every other cycle was silently skipped. An actual fetch is bounded
  # by FeedFetcher::DEFAULT_TIMEOUT (30s), so two minutes covers anything
  # genuinely in flight with room to spare.
  UPDATE_IN_PROGRESS_WINDOW = 2.minutes

  # How far ahead the scheduler looks when deciding a feed is due.
  #
  # next_poll_at (and last_updated, for feeds still on the legacy path) is
  # stamped when a poll *finished*, always some seconds after the cron tick
  # that scheduled it. Without a lookahead any interval that is a multiple of
  # the 5-minute cron period lands just past the matching tick and waits a
  # whole extra cycle: a feed at MIN_POLL_INTERVAL polled at 22:05:07 is due
  # 22:10:07, the 22:10:02 run skips it, and it polls at 22:15 on an effective
  # 10-minute interval. DEFAULT_NEW_FEED_INTERVAL (15 min) became 20, and
  # manual update_interval values of 5/10/15/30 were inflated the same way.
  #
  # A minute covers a full-timeout fetch (FeedFetcher::DEFAULT_TIMEOUT, 30s)
  # plus queue latency, and stays far enough under MIN_POLL_INTERVAL that the
  # worst case is polling a feed a few seconds early rather than a cycle late.
  POLL_DUE_SLACK = 1.minute

  # Feeds that are not currently being updated by another job.
  scope :not_updating, -> {
    where("last_update_started IS NULL OR last_update_started < ?", UPDATE_IN_PROGRESS_WINDOW.ago)
  }

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

  # How many consecutive failures before a feed is called broken rather than
  # merely erroring.
  #
  # Five is chosen against BACKOFF_DELAYS, not picked round: reaching it costs
  # 5min + 15min + 1h + 4h of waiting on top of the five attempts themselves, so
  # nothing is labelled broken until it has failed continuously for better than
  # five hours. A deploy, a certificate renewal, a nightly maintenance window
  # and a brief DNS wobble all clear well inside that. It also lands exactly
  # where the backoff curve tops out, so "broken" and "backed off as far as we
  # go" are the same moment rather than two thresholds to keep in step.
  #
  # Deliberately a count and not a duration. A duration alone would libel a feed
  # that is simply polled rarely; the count carries a duration floor through the
  # curve above, and first_failed_at gives the UI the real elapsed time, which is
  # the more useful thing to show a person anyway.
  BROKEN_AFTER_CONSECUTIVE_FAILURES = 5

  # Feeds whose failing streak has run past the threshold above.
  scope :broken, -> { where(consecutive_failures: BROKEN_AFTER_CONSECUTIVE_FAILURES..) }

  # Adaptive polling interval bounds (in seconds)
  MIN_POLL_INTERVAL = 5.minutes.to_i

  # Ceiling on how stale any feed is allowed to get, regardless of how rarely it
  # posts. A weekly or monthly feed still gets checked 4x/day: fetches send
  # If-None-Match/If-Modified-Since (see FeedFetcher), so a quiet feed costs a
  # 304 with no body. Long caps here are what made a "Fresh" folder show
  # days-old items even with the scheduler running.
  MAX_POLL_INTERVAL = 6.hours.to_i
  DEFAULT_NEW_FEED_INTERVAL = 15.minutes.to_i

  # How many times to poll per expected post. Higher means new entries are
  # picked up sooner after publication, at the cost of more conditional GETs.
  POLLS_PER_POST = 4

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

  # Record a failed fetch and push the next poll out.
  #
  # This is the counterpart to apply_backoff! for failures we decided on rather
  # than ones a server dictated, and the split between the two columns is the
  # whole point. apply_backoff! writes retry_after, which means "the host told us
  # to wait" and is honoured everywhere, including the morning force sweep and
  # the manual refresh button. This writes next_poll_at, which is only ever our
  # own schedule, so both of those paths still go out and try a broken feed.
  #
  # Without this, a fetch error updated last_error and nothing else. next_poll_at
  # kept its old value in the past, last_updated was never stamped, and so the
  # scheduler found the feed due again on the very next tick. A feed with a dead
  # domain was re-requested every five minutes, 288 times a day, indefinitely.
  # Under the curve above it converges on one attempt a day instead, plus the
  # 6am sweep.
  def record_failure!(error_message)
    self.consecutive_failures += 1
    self.last_error = error_message.to_s
    self.first_failed_at ||= Time.current
    self.next_poll_at = Time.current + failure_backoff_delay
    save!
  end

  # How long to wait before the next attempt, given the streak so far. Walks
  # BACKOFF_DELAYS and stays on the last entry once the streak runs past its end.
  def failure_backoff_delay
    BACKOFF_DELAYS[[ consecutive_failures - 1, BACKOFF_DELAYS.length - 1 ].min]
  end

  # Whether this feed has failed often enough to be worth telling the reader
  # about as a broken feed rather than a feed that happened to error once.
  def broken?
    consecutive_failures >= BROKEN_AFTER_CONSECUTIVE_FAILURES
  end

  # How long the current failing streak has been running, or nil if the feed is
  # not currently failing.
  def failing_for
    return nil if first_failed_at.nil?

    Time.current - first_failed_at
  end

  # Reset backoff after successful fetch
  def reset_backoff!
    return if consecutive_failures.zero? && retry_after.nil? && first_failed_at.nil?

    update!(consecutive_failures: 0, retry_after: nil, first_failed_at: nil)
  end

  # Whether the feed is currently in backoff period
  def in_backoff?
    retry_after.present? && retry_after > Time.current
  end

  # Whether another update is presumed to still be running for this feed.
  # Row-level counterpart of the not_updating scope; both share one window so
  # the scheduler and the per-feed job agree on what counts as in flight.
  def update_in_progress?
    last_update_started.present? && last_update_started > UPDATE_IN_PROGRESS_WINDOW.ago
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
  #
  # avg_posts_per_day is recalculated on every poll, not only on polls that
  # bring in entries. The rolling window slides with the clock, so a feed that
  # goes quiet only sees its rate fall if something recomputes it while nothing
  # is arriving. Recalculating solely on new entries left a feed that used to
  # post 5x/day pinned at 5.0 forever, polled every ~1.2h until it posted again.
  #
  # @param new_entries_count [Integer] number of new entries added this update
  def update_polling_stats!(new_entries_count)
    updates = { avg_posts_per_day: calculate_avg_posts_per_day }

    updates[:last_new_entry_at] = Time.current if new_entries_count > 0

    # Calculate optimal interval based on publication frequency
    updates[:calculated_interval_seconds] = calculate_optimal_interval(
      updates[:avg_posts_per_day]
    )

    # Set next poll time (respects manual override if set)
    updates[:next_poll_at] = Time.current + effective_poll_interval_seconds(
      updates[:calculated_interval_seconds]
    )

    update!(updates)
  end

  # Re-derive the polling interval from the already measured publication rate and
  # pull next_poll_at in if it now sits beyond that interval. Used by
  # feeds:recalculate_poll_intervals after the tuning constants change: a feed
  # parked days out would otherwise keep its old schedule until it happened to
  # come due. Leaves next_poll_at nil where it is nil, so feeds that have never
  # polled are not pushed into the future.
  def recalculate_polling_interval!
    interval = calculate_optimal_interval(avg_posts_per_day)
    updates = { calculated_interval_seconds: interval }

    if next_poll_at
      latest_acceptable = Time.current + effective_poll_interval_seconds(interval)
      updates[:next_poll_at] = [ next_poll_at, latest_acceptable ].min
    end

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

  def clear_failure_state_on_url_change
    return unless feed_url_changed?

    self.consecutive_failures = 0
    self.retry_after = nil
    self.first_failed_at = nil
    self.last_error = ""
    self.next_poll_at = nil
  end

  # Calculate average posts per day based on recent entries
  def calculate_avg_posts_per_day
    cutoff = ROLLING_AVERAGE_DAYS.days.ago

    # Count entries from this feed in the rolling window
    entry_count = user_entries
      .joins(:entry)
      .where("entries.updated >= ?", cutoff)
      .count

    entry_count.to_f / ROLLING_AVERAGE_DAYS
  end

  # Calculate optimal polling interval based on posts per day
  # Higher frequency = shorter interval
  def calculate_optimal_interval(posts_per_day)
    return MAX_POLL_INTERVAL if posts_per_day <= 0

    # posts_per_day = N means N posts in 24 hours, and we want POLLS_PER_POST
    # checks per post, so ideal interval = 24 hours / (POLLS_PER_POST * N).
    ideal_seconds = (1.day.to_i / (POLLS_PER_POST * posts_per_day)).to_i

    # Clamp to reasonable bounds
    ideal_seconds.clamp(MIN_POLL_INTERVAL, MAX_POLL_INTERVAL)
  end
end
