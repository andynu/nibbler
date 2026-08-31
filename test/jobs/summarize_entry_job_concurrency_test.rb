require "test_helper"

# Whether two readers pressing the summary button on the same article at the
# same moment produce one call to the model or several.
#
# Single-threaded, almost any implementation looks right, so this file drives
# real threads against real database connections rather than asserting on
# `assert_enqueued_jobs`. It carries its own control -- the obvious
# check-then-enqueue -- because a dedupe test that has never seen a duplicate is
# not evidence of anything.
#
# What is guaranteed, and where:
#
# - The enqueue check is best effort. GoodJob takes pg_advisory_xact_lock around
#   the count, then rolls that transaction back before ActiveJob hands the job to
#   the adapter, so the lock is gone by the time the row is written. It removes
#   most duplicates and is not a mutex. Measured over 30 trials of six
#   simultaneous presses it produced 2 rows 26 times, 3 rows 3 times and 1 row
#   once; the same 30 trials of the check-then-enqueue control produced 6 rows
#   every time.
# - The perform check is strict. A job is only "running" once a worker holds an
#   advisory lock on its row for the duration, so the check picks the oldest
#   running job with the key and makes every other one raise
#   ConcurrencyExceededError and retry later. Two generations for one entry
#   cannot overlap.
# - The model call is guarded by SummarizeEntryJob#perform itself, which re-reads
#   the entry and returns the cached summary if a current one appeared while it
#   waited. Given the perform check serialises them, the second job finds the
#   first one's summary and spends nothing.
class SummarizeEntryJobConcurrencyTest < ActiveSupport::TestCase
  # Threads need their own connections. A transactional test would hide the
  # fixtures from them and hide their inserts from the assertions.
  self.use_transactional_tests = false

  # Enough to interleave, comfortably inside the pool (config/database.yml sizes
  # it from RAILS_MAX_THREADS plus Action Cable's worker pool).
  THREADS = 6

  PARAGRAPH = "The commission fined three brokerages ninety million dollars after " \
              "finding they had misreported client holdings for nine quarters.".freeze

  # The obvious implementation, kept as the control: ask whether a job for this
  # entry is already queued and enqueue if not. Correct on one thread and wrong
  # on several, because every thread reads "no" before any of them has written.
  class UncontrolledSummarizeEntryJob < ApplicationJob
    def perform(entry_id); end
  end

  setup do
    @entry = entries(:basic)
    @other_entry = user_entries(:read_entry).entry
    @original_factory = SummarizeEntryJob.summarizer_factory

    # GoodJob's concurrency control is a no-op under any other adapter (it
    # begins `next unless job.class.queue_adapter.is_a?(GoodJob::Adapter)`), so
    # the suite's :test adapter would make every assertion here vacuous.
    # :external inserts the row and leaves it for a worker, which is what both
    # development and production run.
    adapter = GoodJob::Adapter.new(execution_mode: :external)
    SummarizeEntryJob.enable_test_adapter(adapter)
    UncontrolledSummarizeEntryJob.enable_test_adapter(adapter)

    GoodJob::Job.delete_all
    EntrySummary.delete_all
  end

  teardown do
    SummarizeEntryJob.summarizer_factory = @original_factory
    SummarizeEntryJob.disable_test_adapter
    UncontrolledSummarizeEntryJob.disable_test_adapter
    GoodJob::Job.delete_all
    EntrySummary.delete_all
  end

  # --- the control ----------------------------------------------------------

  test "check-then-enqueue lets concurrent readers start a generation each" do
    in_parallel(THREADS) { naive_enqueue(@other_entry.id) }

    # Asserted as "more than one" rather than "six" because the claim being made
    # is that the interleaving happens at all. It is six in practice: 30 trials
    # of six threads produced six rows 30 times.
    assert_operator uncontrolled_jobs.count, :>, 1,
      "the control has to actually race, or the assertions below mean nothing"
  end

  # --- what the enqueue check is worth --------------------------------------

  test "the concurrency key removes most of the duplicate enqueues" do
    in_parallel(THREADS) { SummarizeEntryJob.perform_later(@entry.id) }

    assert_operator jobs_for(@entry).count, :<, THREADS
    assert_operator jobs_for(@entry).count, :>=, 1
  end

  test "the suppressed enqueues say so rather than reporting success" do
    results = in_parallel(THREADS) { SummarizeEntryJob.perform_later(@entry.id) }

    assert_equal jobs_for(@entry).count, results.count { |result| result }
    assert_includes results, false, "a refused enqueue is how the controller knows one is already in flight"
  end

  # Two clicks from one reader, which is the same problem arriving in order.
  # Nothing is racing here, so this one is exact.
  test "a second press while one is queued enqueues nothing" do
    assert SummarizeEntryJob.perform_later(@entry.id)
    assert_equal false, SummarizeEntryJob.perform_later(@entry.id)

    assert_equal 1, jobs_for(@entry).count
  end

  # --- what actually holds: one model call ----------------------------------

  # The acceptance criterion, and the only one that costs anything if it breaks.
  # Running every job that survived a concurrent press, in the order the perform
  # check would let them run, must reach the model once and leave one summary.
  test "however many jobs survive the race, the model is called once" do
    summarizer = stub_summarizer
    in_parallel(THREADS) { SummarizeEntryJob.perform_later(@entry.id) }
    assert_operator jobs_for(@entry).count, :>=, 1

    jobs_for(@entry).count.times { SummarizeEntryJob.perform_now(@entry.id) }

    assert_equal 1, summarizer.calls
    assert_equal 1, EntrySummary.where(entry_id: @entry.id).count
  end

  # --- the key --------------------------------------------------------------

  # The lock is per entry. Suppressing every summary in the app while one runs
  # would be a different bug with the same green test.
  test "a different article is not held up by this one" do
    SummarizeEntryJob.perform_later(@entry.id)

    assert SummarizeEntryJob.perform_later(@other_entry.id)
    assert_equal 1, jobs_for(@entry).count
    assert_equal 1, jobs_for(@other_entry).count
  end

  # The key is written to a column with its own partial index on unfinished
  # rows, which is why this is preferred to Api::V1::EntriesController#audio's
  # LIKE against the serialized_params JSON.
  test "the key is stored on the job row, not buried in its arguments" do
    SummarizeEntryJob.perform_later(@entry.id)

    assert_equal(
      SummarizeEntryJob.concurrency_key_for(@entry.id),
      GoodJob::Job.where(job_class: "SummarizeEntryJob").last.concurrency_key
    )
  end

  # Once the generation finishes the reader can ask again, for a regenerate or
  # after the article changed.
  test "a finished generation stops blocking the next one" do
    SummarizeEntryJob.perform_later(@entry.id)
    jobs_for(@entry).update_all(finished_at: Time.current)

    assert SummarizeEntryJob.perform_later(@entry.id)
  end

  private
    def jobs_for(entry)
      GoodJob::Job.where(concurrency_key: SummarizeEntryJob.concurrency_key_for(entry.id)).unfinished
    end

    def uncontrolled_jobs
      GoodJob::Job.where(job_class: UncontrolledSummarizeEntryJob.name).unfinished
    end

    def stub_summarizer
      summarizer = StubSummarizer.new
      SummarizeEntryJob.summarizer_factory = -> { summarizer }
      summarizer
    end

    # What the controller would do without GoodJob: look for an unfinished job
    # and enqueue if there is none. No artificial delay is needed to make it
    # lose; measured over 30 trials of six threads it produced six rows every
    # single time, because the read and the write are far enough apart on their
    # own.
    def naive_enqueue(entry_id)
      return if uncontrolled_jobs.exists?

      UncontrolledSummarizeEntryJob.perform_later(entry_id)
    end

    # Runs the block on `count` threads released together, each with its own
    # database connection, and returns their results in order.
    #
    # The `SELECT 1` is what makes the threads actually simultaneous. Opening a
    # Postgres connection takes long enough that without it the first thread
    # through has finished its insert before the last has finished connecting,
    # and the control below stops racing -- observed as one row instead of six.
    def in_parallel(count)
      barrier = Concurrent::CyclicBarrier.new(count)

      count.times.map do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do |connection|
            connection.select_value("SELECT 1")
            barrier.wait
            yield
          end
        end
      end.map(&:value)
    end

    class StubSummarizer
      attr_reader :calls

      def initialize
        @calls = 0
      end

      def summarize(_entry)
        @calls += 1
        { summary: PARAGRAPH, model: "gemma4:e4b" }
      end
    end
end
