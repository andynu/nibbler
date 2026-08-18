# Scheduler job that enqueues FetchFaviconJob for feeds needing favicon updates
# Runs periodically via GoodJob cron (e.g., daily)
class UpdateFaviconsJob < ApplicationJob
  queue_as :default

  # How often to re-check favicons (7 days)
  REFRESH_INTERVAL = 7.days

  def perform
    eligible_feeds.find_each do |feed|
      FetchFaviconJob.perform_later(feed.id) if needs_refresh?(feed)
    end
  end

  private

  # Feeds whose favicon this job is allowed to fetch: no custom icon, and a
  # site to fetch from.
  def eligible_feeds
    Feed.where(favicon_is_custom: [ false, nil ])
        .where.not(site_url: [ nil, "" ])
  end

  def needs_refresh?(feed)
    stale?(feed) || icon_file_missing?(feed)
  end

  def stale?(feed)
    feed.favicon_last_checked.nil? || feed.favicon_last_checked < REFRESH_INTERVAL.ago
  end

  # Backstop for a lost icon cache: a feed can be well within REFRESH_INTERVAL
  # and still render a broken image if the file behind icon_url is gone (a
  # container without the icons volume, a manual purge). Timestamps alone would
  # leave those feeds broken until the interval expired.
  def icon_file_missing?(feed)
    return false if feed.icon_url.blank?

    !File.exist?(icon_path(feed))
  end

  # Resolved through the icons dir by basename, so a stored icon_url can never
  # point the existence check outside that directory.
  def icon_path(feed)
    FetchFaviconJob::ICONS_DIR.join(File.basename(feed.icon_url))
  end
end
