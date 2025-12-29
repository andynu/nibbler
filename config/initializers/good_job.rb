# frozen_string_literal: true

Rails.application.configure do
  # Cron-like recurring jobs
  config.good_job.cron = {
    update_feeds: {
      cron: "*/5 * * * *", # every 5 minutes
      class: "UpdateFeedsJob",
      description: "Check for feeds needing updates and enqueue individual feed jobs"
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
    }
  }

  # Preserve finished jobs for 14 days (for debugging/auditing)
  config.good_job.preserve_job_records = 14.days

  # Clean up old job records automatically
  config.good_job.cleanup_preserved_jobs_before_seconds_ago = 14.days.to_i
  config.good_job.cleanup_interval_jobs = 1000
  config.good_job.cleanup_interval_seconds = 10.minutes.to_i
end
