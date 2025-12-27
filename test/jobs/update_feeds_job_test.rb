require "test_helper"

class UpdateFeedsJobTest < ActiveJob::TestCase
  setup do
    # Clear all feeds to isolate tests from fixtures
    Feed.delete_all

    @user = users(:one)
    @feed_ready = Feed.create!(
      user: @user,
      title: "Ready Feed",
      feed_url: "https://example.com/ready.rss"
    )
    @feed_not_ready = Feed.create!(
      user: @user,
      title: "Not Ready Feed",
      feed_url: "https://example.com/not-ready.rss"
    )
  end

  test "enqueues feeds that need updating via next_poll_at" do
    @feed_ready.update!(next_poll_at: 1.minute.ago)
    @feed_not_ready.update!(next_poll_at: 1.hour.from_now)

    assert_enqueued_with(job: UpdateFeedJob, args: [@feed_ready.id]) do
      UpdateFeedsJob.perform_now
    end
  end

  test "does not enqueue feeds not yet due" do
    @feed_ready.update!(next_poll_at: 1.hour.from_now)
    @feed_not_ready.update!(next_poll_at: 1.hour.from_now)

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now
    end
  end

  test "falls back to legacy behavior for feeds without next_poll_at" do
    # Feed with no next_poll_at but never updated should be polled
    @feed_ready.update!(next_poll_at: nil, last_updated: nil)
    # Mark other feed as already polled to exclude it
    @feed_not_ready.update!(next_poll_at: 1.hour.from_now)

    assert_enqueued_with(job: UpdateFeedJob, args: [@feed_ready.id]) do
      UpdateFeedsJob.perform_now
    end
  end

  test "skips feeds in backoff period" do
    @feed_ready.update!(next_poll_at: 1.minute.ago, retry_after: 1.hour.from_now)
    @feed_not_ready.update!(next_poll_at: 1.hour.from_now)

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now
    end
  end

  test "skips feeds recently started updating" do
    @feed_ready.update!(next_poll_at: 1.minute.ago, last_update_started: 1.minute.ago)
    @feed_not_ready.update!(next_poll_at: 1.hour.from_now)

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now
    end
  end
end
