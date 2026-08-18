# Scheduler job that enqueues UpdateFeedJob for feeds that need updating
# Runs every 5 minutes via GoodJob cron.
#
# Also runs once each morning with force: true (the refresh_all_feeds_morning
# cron entry). In that mode the adaptive polling window is ignored so every
# feed is refreshed before the day starts, no matter how far next_poll_at has
# drifted or how many consecutive failures pushed it out. Rate limiting
# (retry_after) and the concurrent-update guard still apply, matching the
# manual refresh path in Api::V1::FeedsController#refresh.
class UpdateFeedsJob < ApplicationJob
  queue_as :default

  def perform(force: false)
    feeds_to_update(force: force).find_each do |feed|
      UpdateFeedJob.perform_later(feed.id)
    end
  end

  private

  def feeds_to_update(force: false)
    # Never touch a feed that is rate limited or already mid-update, in either
    # mode. The mid-update window (Feed::UPDATE_IN_PROGRESS_WINDOW) is shorter
    # than this job's 5-minute cron period on purpose: matching the two made
    # qualification depend on seconds of scheduler jitter and skipped whole
    # cycles.
    scope = Feed
      .not_updating
      .where("retry_after IS NULL OR retry_after <= ?", Time.current)

    # force: sweep everything else. Otherwise restrict to feeds due under
    # adaptive polling (next_poll_at), falling back to legacy interval logic
    # for feeds without next_poll_at set.
    return scope if force

    # Look Feed::POLL_DUE_SLACK past the current tick. Poll times are stamped
    # when the previous poll finished, a few seconds after the tick that
    # scheduled it, so an exact comparison makes every interval that is a
    # multiple of the cron period slip a full cycle. Rate limiting above stays
    # on the real clock: retry_after is the server's window, not ours.
    scope.where(adaptive_polling_condition, due_at: Time.current + Feed::POLL_DUE_SLACK)
  end

  def adaptive_polling_condition
    # Use next_poll_at if set (adaptive polling), otherwise fall back to legacy interval logic
    <<~SQL.squish
      (next_poll_at IS NOT NULL AND next_poll_at <= :due_at)
      OR (next_poll_at IS NULL AND (
        last_updated IS NULL
        OR (update_interval > 0 AND last_updated + (update_interval || ' minutes')::interval <= :due_at)
        OR (update_interval = 0 AND last_updated + '30 minutes'::interval <= :due_at)
      ))
    SQL
  end
end
