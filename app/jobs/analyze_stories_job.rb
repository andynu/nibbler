# Scheduler job that enqueues an AnalyzeStoryJob for every active Story.
#
# Runs on a cron schedule (see config/initializers/good_job.rb). This runs
# after FetchStoriesJob so the analyze pass operates on a freshly-populated
# set of story_articles.
#
# @see AnalyzeStoryJob for the per-story work
# @see FetchStoriesJob for the article fetcher that runs before this
class AnalyzeStoriesJob < ApplicationJob
  queue_as :default

  def perform
    Story.active.find_each do |story|
      AnalyzeStoryJob.perform_later(story.id)
    end
  end
end
