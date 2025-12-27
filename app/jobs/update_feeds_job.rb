# Scheduler job that enqueues UpdateFeedJob for feeds that need updating
# Runs every 5 minutes via GoodJob cron
class UpdateFeedsJob < ApplicationJob
  queue_as :default

  def perform
    feeds_to_update.find_each do |feed|
      UpdateFeedJob.perform_later(feed.id)
    end
  end

  private

  def feeds_to_update
    # Get feeds that need updating based on adaptive polling (next_poll_at)
    # Falls back to legacy behavior for feeds without next_poll_at set
    Feed.where(adaptive_polling_condition, Time.current)
      .where("last_update_started IS NULL OR last_update_started < ?", 5.minutes.ago)
      .where("retry_after IS NULL OR retry_after <= ?", Time.current)
  end

  def adaptive_polling_condition
    # Use next_poll_at if set (adaptive polling), otherwise fall back to legacy interval logic
    <<~SQL.squish
      (next_poll_at IS NOT NULL AND next_poll_at <= ?)
      OR (next_poll_at IS NULL AND (
        last_updated IS NULL
        OR (update_interval > 0 AND last_updated < NOW() - (update_interval || ' minutes')::interval)
        OR (update_interval = 0 AND last_updated < NOW() - '30 minutes'::interval)
      ))
    SQL
  end
end
