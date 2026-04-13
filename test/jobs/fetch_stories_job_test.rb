require "test_helper"

class FetchStoriesJobTest < ActiveJob::TestCase
  test "enqueues FetchStoryArticlesJob for each active story" do
    active = stories(:active_story)
    sourced = stories(:sourced_story)
    concluded = stories(:concluded_story)

    FetchStoriesJob.perform_now

    # Active stories should be enqueued
    assert_enqueued_with(job: FetchStoryArticlesJob, args: [ active.id ])
    assert_enqueued_with(job: FetchStoryArticlesJob, args: [ sourced.id ])

    # Concluded should not be enqueued
    enqueued_ids = enqueued_jobs
      .select { |j| j[:job] == FetchStoryArticlesJob }
      .map { |j| j[:args].first }
    refute_includes enqueued_ids, concluded.id
  end
end
