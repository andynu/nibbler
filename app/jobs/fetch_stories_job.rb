# Scheduler job that enqueues a FetchStoryArticlesJob for every active Story.
#
# Runs on a cron schedule (see config/initializers/good_job.rb). Stories are
# low-volume and the fetch is overnight-friendly (matching newswatch's batch
# cadence), so we do not gate on a per-story "next_poll_at" the way feeds do.
class FetchStoriesJob < ApplicationJob
  queue_as :default

  def perform
    Story.active.find_each do |story|
      FetchStoryArticlesJob.perform_later(story.id)
    end
  end
end
