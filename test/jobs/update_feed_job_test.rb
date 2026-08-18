require "test_helper"
require "minitest/mock"

# Covers the worker-thread economics of UpdateFeedJob as much as its logic.
#
# One of these is enqueued per due feed every 5 minutes (73 of them in
# production) into a pool of a handful of threads. A job that sleeps is a job
# that holds a thread hostage, so the domain rate limit is enforced by
# rescheduling and the job must never block on a fixed inter-request delay.
class UpdateFeedJobTest < ActiveJob::TestCase
  FEED_URL = "https://example.com/feed.xml".freeze
  CACHE_KEY = "domain_throttle:example.com".freeze

  setup do
    @user = users(:one)
    @feed = Feed.create!(user: @user, title: "Example", feed_url: FEED_URL)

    # The test environment uses :null_store, which can never report a busy
    # domain. Swap in a real store so the throttle is exercisable.
    @original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
  end

  teardown do
    Rails.cache = @original_cache
  end

  # ===================
  # No blocking sleeps
  # ===================

  test "does not sleep when the domain is free" do
    slept = nil

    stub_updater do
      slept = capture_sleeps { |job| job.perform_now }
    end

    assert_empty slept
  end

  test "does not sleep when it defers around a busy domain" do
    DomainThrottler.record(FEED_URL)

    slept = capture_sleeps { |job| job.perform_now }

    assert_empty slept
  end

  # ==========================
  # Deferring a busy domain
  # ==========================

  test "reschedules instead of fetching when the domain was just requested" do
    DomainThrottler.record(FEED_URL)
    updated = []

    assert_enqueued_with(job: UpdateFeedJob) do
      stub_updater(calls: updated) { UpdateFeedJob.perform_now(@feed.id) }
    end

    assert_empty updated, "should not have fetched while the domain was busy"
  end

  test "reschedules for the remaining domain delay and counts the deferral" do
    DomainThrottler.record(FEED_URL)

    stub_updater { UpdateFeedJob.perform_now(@feed.id) }

    enqueued = enqueued_jobs.last
    assert_equal @feed.id, enqueued[:args].first
    assert_equal 1, enqueued[:args].last["deferrals"]
    assert_in_delta DomainThrottler::DOMAIN_DELAY, enqueued[:at] - Time.current.to_f, 1.0
  end

  test "fetches without rescheduling once the deferral budget is spent" do
    DomainThrottler.record(FEED_URL)
    updated = []

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      stub_updater(calls: updated) do
        # A blocking wait is the accepted fallback at the budget limit; stub it
        # out so the suite does not actually pause for it.
        DomainThrottler.stub(:wait_for, nil) do
          UpdateFeedJob.perform_now(@feed.id, deferrals: UpdateFeedJob::MAX_DEFERRALS)
        end
      end
    end

    assert_equal [ @feed ], updated
  end

  test "fetches immediately when no request to the domain is on record" do
    updated = []

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      stub_updater(calls: updated) { UpdateFeedJob.perform_now(@feed.id) }
    end

    assert_equal [ @feed ], updated
  end

  # ==========================
  # Recording the request
  # ==========================

  test "records the request time so the next feed on the domain defers" do
    freeze_time do
      stub_updater { UpdateFeedJob.perform_now(@feed.id) }

      assert_equal Time.current, Rails.cache.read(CACHE_KEY)
    end
  end

  test "records the request time even when the fetch raises" do
    raising = Object.new
    raising.define_singleton_method(:update) { raise "connection reset" }

    FeedUpdater.stub(:new, ->(_feed) { raising }) do
      UpdateFeedJob.perform_now(@feed.id)
    end

    assert_not_nil Rails.cache.read(CACHE_KEY),
                   "a failed fetch still hit the server and must count against the domain delay"
  end

  # ==========================
  # Pre-existing guards
  # ==========================

  test "does nothing for a feed that no longer exists" do
    updated = []

    stub_updater(calls: updated) { UpdateFeedJob.perform_now(-1) }

    assert_empty updated
    assert_nil Rails.cache.read(CACHE_KEY)
  end

  test "skips a feed already mid-update" do
    @feed.update!(last_update_started: 1.minute.ago)
    updated = []

    stub_updater(calls: updated) { UpdateFeedJob.perform_now(@feed.id) }

    assert_empty updated
  end

  test "skips a rate-limited feed in backoff" do
    @feed.update!(retry_after: 1.hour.from_now)
    updated = []

    stub_updater(calls: updated) { UpdateFeedJob.perform_now(@feed.id) }

    assert_empty updated
  end

  private

  def ok_result
    FeedUpdater::UpdateResult.new(feed: @feed, new_entries_count: 0, status: :ok)
  end

  # Replaces the network boundary. `calls` collects the feeds handed to
  # FeedUpdater so tests can assert whether a fetch happened at all.
  def stub_updater(calls: [], result: nil, &block)
    updater = Object.new
    outcome = result || ok_result
    updater.define_singleton_method(:update) { outcome }

    FeedUpdater.stub(:new, ->(feed) { calls << feed; updater }, &block)
    calls
  end

  # Runs the job through an instance we hold a reference to, so Kernel#sleep
  # can be intercepted. Yields the job; returns the durations it tried to
  # sleep for.
  def capture_sleeps
    job = UpdateFeedJob.new(@feed.id)
    slept = []
    job.stub(:sleep, ->(seconds) { slept << seconds }) { yield job }
    slept
  end
end
