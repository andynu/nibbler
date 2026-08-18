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

    assert_enqueued_with(job: UpdateFeedJob, args: [ @feed_ready.id ]) do
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

    assert_enqueued_with(job: UpdateFeedJob, args: [ @feed_ready.id ]) do
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

  # The in-progress guard has to clear well inside the */5 cron period, or a
  # feed polled on one cycle is still "mid-update" on the next and the run
  # enqueues nothing at all.
  test "enqueues a feed whose last update started before the in-progress window" do
    @feed_ready.update!(next_poll_at: 1.minute.ago, last_update_started: 3.minutes.ago)
    @feed_not_ready.update!(next_poll_at: 1.hour.from_now)

    assert_enqueued_with(job: UpdateFeedJob, args: [ @feed_ready.id ]) do
      UpdateFeedsJob.perform_now
    end
  end

  test "in-progress window is shorter than the scheduler cron period" do
    assert_operator Feed::UPDATE_IN_PROGRESS_WINDOW, :<, 5.minutes
  end

  # Poll times are stamped when a poll finished, seconds after the cron tick
  # that scheduled it, so an exact next_poll_at <= now comparison pushed every
  # interval that is a multiple of the 5-minute period into the following
  # cycle: a MIN_POLL_INTERVAL feed polled at 22:05:07 was due 22:10:07, the
  # 22:10:02 run skipped it, and it ran at 22:15 on an effective 10 minutes.
  test "enqueues a 5-minute feed on the tick matching its interval" do
    tick = Time.utc(2026, 1, 1, 22, 5, 0)
    @feed_ready.update!(update_interval: 5, next_poll_at: tick + 7.seconds + 5.minutes)
    @feed_not_ready.destroy!

    travel_to(tick + 5.minutes + 2.seconds) do
      assert_enqueued_with(job: UpdateFeedJob, args: [ @feed_ready.id ]) do
        UpdateFeedsJob.perform_now
      end
    end
  end

  test "enqueues a feed coming due inside the slack window" do
    @feed_ready.update!(next_poll_at: (Feed::POLL_DUE_SLACK - 10.seconds).from_now)
    @feed_not_ready.destroy!

    assert_enqueued_with(job: UpdateFeedJob, args: [ @feed_ready.id ]) do
      UpdateFeedsJob.perform_now
    end
  end

  test "does not enqueue a feed coming due beyond the slack window" do
    @feed_ready.update!(next_poll_at: (Feed::POLL_DUE_SLACK + 10.seconds).from_now)
    @feed_not_ready.destroy!

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now
    end
  end

  # Same slip on the legacy path, where due-ness is derived from last_updated.
  test "enqueues a legacy-interval feed on the tick matching its interval" do
    tick = Time.utc(2026, 1, 1, 22, 5, 0)
    @feed_ready.update!(next_poll_at: nil, update_interval: 5, last_updated: tick + 7.seconds)
    @feed_not_ready.destroy!

    travel_to(tick + 5.minutes + 2.seconds) do
      assert_enqueued_with(job: UpdateFeedJob, args: [ @feed_ready.id ]) do
        UpdateFeedsJob.perform_now
      end
    end
  end

  test "legacy-interval feed polled this cycle is not enqueued again" do
    @feed_ready.update!(next_poll_at: nil, update_interval: 30, last_updated: 1.minute.ago)
    @feed_not_ready.destroy!

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now
    end
  end

  # Slack has to absorb a full-timeout fetch without reaching far enough ahead
  # to pull the shortest interval meaningfully early.
  test "slack covers a full-timeout fetch and stays well under the minimum interval" do
    assert_operator Feed::POLL_DUE_SLACK.to_i, :>=, FeedFetcher::DEFAULT_TIMEOUT
    assert_operator Feed::POLL_DUE_SLACK.to_i, :<, Feed::MIN_POLL_INTERVAL / 2
  end

  # force: true is the morning sweep (refresh_all_feeds_morning cron entry)
  test "force enqueues a feed backed off far past its next_poll_at" do
    @feed_ready.update!(next_poll_at: 7.days.from_now)
    @feed_not_ready.destroy!

    assert_enqueued_with(job: UpdateFeedJob, args: [ @feed_ready.id ]) do
      UpdateFeedsJob.perform_now(force: true)
    end
  end

  test "force enqueues every feed regardless of adaptive polling" do
    @feed_ready.update!(next_poll_at: 1.hour.from_now)
    @feed_not_ready.update!(next_poll_at: 30.days.from_now)

    assert_enqueued_jobs 2, only: UpdateFeedJob do
      UpdateFeedsJob.perform_now(force: true)
    end
  end

  test "force still skips rate-limited feeds in backoff" do
    @feed_ready.update!(next_poll_at: 7.days.from_now, retry_after: 1.hour.from_now)
    @feed_not_ready.destroy!

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now(force: true)
    end
  end

  test "force still skips feeds already mid-update" do
    @feed_ready.update!(next_poll_at: 7.days.from_now, last_update_started: 1.minute.ago)
    @feed_not_ready.destroy!

    assert_no_enqueued_jobs(only: UpdateFeedJob) do
      UpdateFeedsJob.perform_now(force: true)
    end
  end

  test "force enqueues a feed whose retry_after has expired" do
    @feed_ready.update!(next_poll_at: 7.days.from_now, retry_after: 1.hour.ago)
    @feed_not_ready.destroy!

    assert_enqueued_with(job: UpdateFeedJob, args: [ @feed_ready.id ]) do
      UpdateFeedsJob.perform_now(force: true)
    end
  end
end
