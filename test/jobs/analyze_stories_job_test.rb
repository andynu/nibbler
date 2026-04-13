require "test_helper"

class AnalyzeStoriesJobTest < ActiveJob::TestCase
  test "enqueues AnalyzeStoryJob for each active story" do
    active = stories(:active_story)
    sourced = stories(:sourced_story)
    concluded = stories(:concluded_story)

    AnalyzeStoriesJob.perform_now

    assert_enqueued_with(job: AnalyzeStoryJob, args: [ active.id ])
    assert_enqueued_with(job: AnalyzeStoryJob, args: [ sourced.id ])

    enqueued_ids = enqueued_jobs
      .select { |j| j[:job] == AnalyzeStoryJob }
      .map { |j| j[:args].first }
    refute_includes enqueued_ids, concluded.id
  end
end
