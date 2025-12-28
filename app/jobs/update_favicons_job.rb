# Scheduler job that enqueues FetchFaviconJob for feeds needing favicon updates
# Runs periodically via GoodJob cron (e.g., daily)
class UpdateFaviconsJob < ApplicationJob
  queue_as :default

  # How often to re-check favicons (7 days)
  REFRESH_INTERVAL = 7.days

  def perform
    feeds_needing_update.find_each do |feed|
      FetchFaviconJob.perform_later(feed.id)
    end
  end

  private

  def feeds_needing_update
    Feed.where(favicon_is_custom: [ false, nil ])
        .where("favicon_last_checked IS NULL OR favicon_last_checked < ?", REFRESH_INTERVAL.ago)
        .where.not(site_url: [ nil, "" ])
  end
end
