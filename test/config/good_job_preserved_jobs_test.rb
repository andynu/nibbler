require "test_helper"

# Guards config.good_job.preserve_job_records in config/initializers/good_job.rb.
#
# GoodJob::Job#preserve_job_record? keeps a finished row only when the setting
# is true, :on_unhandled_error, or a callable. Anything else, an
# ActiveSupport::Duration included, destroys the row the moment the job
# finishes, and the setting reads back unchanged so nothing looks wrong. How
# long rows are kept is cleanup_preserved_jobs_before_seconds_ago's job.
#
# Cron-enqueued jobs are kept whatever the setting says, so these use plain job
# classes, which is what every per-feed, story and summary job is.
class GoodJobPreservedJobsTest < ActiveSupport::TestCase
  class SucceedingJob < ApplicationJob
    def perform; end
  end

  class FailingJob < ApplicationJob
    def perform
      raise "feed host refused the connection"
    end
  end

  setup do
    # The suite's :test adapter never writes a good_jobs row. :inline runs the
    # job through GoodJob::Job#perform, where the keep-or-destroy decision is.
    adapter = GoodJob::Adapter.new(execution_mode: :inline)
    SucceedingJob.enable_test_adapter(adapter)
    FailingJob.enable_test_adapter(adapter)
  end

  teardown do
    SucceedingJob.disable_test_adapter
    FailingJob.disable_test_adapter
  end

  test "a job that succeeded keeps its row after finishing" do
    SucceedingJob.perform_later

    job = GoodJob::Job.find_by(job_class: SucceedingJob.name)

    assert job, "the finished job's row was destroyed"
    assert job.finished_at
    assert_nil job.error
  end

  test "a job that raised keeps its row and its error" do
    assert_raises(RuntimeError) { FailingJob.perform_later }

    job = GoodJob::Job.find_by(job_class: FailingJob.name)

    assert job, "the failed job's row was destroyed, so there is no error to inspect"
    assert job.finished_at
    assert_match "feed host refused the connection", job.error
  end
end
