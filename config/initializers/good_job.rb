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
