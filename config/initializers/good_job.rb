# frozen_string_literal: true

Rails.application.configure do
  # Cron-like recurring jobs
  config.good_job.cron = {
    update_feeds: {
      cron: "*/5 * * * *", # every 5 minutes
      class: "UpdateFeedsJob",
      description: "Check for feeds needing updates and enqueue individual feed jobs"
    },
    # Guaranteed daily sweep so everything is fresh before the app is opened.
    # The */5 entry above only picks feeds due under adaptive polling, which
    # leaves a feed stale indefinitely if next_poll_at drifts out or repeated
    # failures push it back. force: true ignores next_poll_at but still honors
    # retry_after, so rate-limited hosts are not hammered.
    #
    # The trailing zone field is parsed by fugit (GoodJob calls Fugit.parse),
    # so this is 6am Eastern year-round; the app itself runs in UTC.
    refresh_all_feeds_morning: {
      cron: "0 6 * * * America/New_York",
      class: "UpdateFeedsJob",
      kwargs: { force: true },
      description: "Refresh every feed each morning, bypassing adaptive polling intervals"
    },
    purge_articles: {
      cron: "0 3 * * *", # at 3am daily
      class: "PurgeArticlesJob",
      description: "Remove old articles based on user purge preferences"
    },
    update_favicons: {
      cron: "0 4 * * *", # at 4am daily
      class: "UpdateFaviconsJob",
      description: "Fetch and cache favicons for feeds that need updating"
    },
    # Reconciles CachedImage against public/images/cache both ways: deletes
    # files with no record, and drops records whose file is gone so the article
    # falls back to its original remote image URLs instead of serving 404s.
    # Was never scheduled, so neither direction ran in production.
    cleanup_cached_images: {
      cron: "30 4 * * *", # at 4:30am daily, after update_favicons
      class: "CleanupCachedImagesJob",
      description: "Reconcile cached article image records with files on disk"
    },
    send_digests: {
      cron: "0 * * * *", # every hour at minute 0
      class: "SendDigestsJob",
      description: "Send email digests to users at their preferred time"
    },
    # Fetch runs twice daily. RSS fetches are cheap (no LLM) so we can afford
    # the extra pass to keep stories fresher through the day. The overnight
    # analyze pass (5am) still sees the combined articles from both fetches.
    fetch_stories_overnight: {
      cron: "0 2 * * *", # at 2am daily (overnight batch; baru is idle)
      class: "FetchStoriesJob",
      description: "Fetch Google News RSS results for each active Story's queries (overnight pass)"
    },
    fetch_stories_midday: {
      cron: "0 14 * * *", # at 2pm daily (second cheap RSS-only pass)
      class: "FetchStoriesJob",
      description: "Fetch Google News RSS results for each active Story's queries (midday pass)"
    },
    analyze_stories: {
      cron: "0 5 * * *", # at 5am daily, after fetch_stories_overnight (2am) has settled
      class: "AnalyzeStoriesJob",
      description: "Run LLM analysis for each active Story and update summaries"
    }
  }

  # Preserve finished jobs for 14 days (for debugging/auditing)
  config.good_job.preserve_job_records = 14.days

  # Clean up old job records automatically
  config.good_job.cleanup_preserved_jobs_before_seconds_ago = 14.days.to_i
  config.good_job.cleanup_interval_jobs = 1000
  config.good_job.cleanup_interval_seconds = 10.minutes.to_i
end
