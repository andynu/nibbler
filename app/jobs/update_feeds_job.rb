# Scheduler job that enqueues UpdateFeedJob for feeds that need updating
# Runs periodically via Solid Queue recurring tasks
class UpdateFeedsJob < ApplicationJob
  queue_as :default

  def perform
    feeds_to_update.find_each do |feed|
      UpdateFeedJob.perform_later(feed.id)
    end
  end

  private

  def feeds_to_update
    # Get feeds that need updating based on their update_interval
    # Default interval is 30 minutes (update_interval = 0 means use default)
    Feed
      .where("last_updated IS NULL OR (
        CASE
          WHEN update_interval > 0 THEN last_updated < NOW() - (update_interval || ' minutes')::interval
          ELSE last_updated < NOW() - '30 minutes'::interval
        END
      )")
      .where("last_update_started IS NULL OR last_update_started < ?", 5.minutes.ago)
  end
end
