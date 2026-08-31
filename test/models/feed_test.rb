require "test_helper"

class FeedTest < ActiveSupport::TestCase
  setup do
    @high_frequency = feeds(:high_frequency)
    @low_frequency = feeds(:low_frequency)
    @new_feed = feeds(:new_feed)
    @manual_override = feeds(:manual_override)
  end

  test "MAX_POLL_INTERVAL keeps the worst case staleness within a few hours" do
    # A multi-day cap makes even a healthy scheduler look broken: the newest
    # items sit unfetched for days. Conditional GET makes frequent checks cheap.
    assert Feed::MAX_POLL_INTERVAL <= 6.hours.to_i,
      "MAX_POLL_INTERVAL is #{Feed::MAX_POLL_INTERVAL / 3600.0}h"
  end

  test "calculate_optimal_interval returns short interval for high frequency feeds" do
    # 10 posts per day -> 24 hours / (4 * 10) = 2160 seconds
    interval = @high_frequency.send(:calculate_optimal_interval, 10.0)
    assert_equal 2160, interval
    assert interval >= Feed::MIN_POLL_INTERVAL
    assert interval <= Feed::MAX_POLL_INTERVAL
  end

  test "calculate_optimal_interval scales with posting rate above one post per day" do
    # 2 posts per day -> 24 hours / (4 * 2) = 3 hours
    interval = @high_frequency.send(:calculate_optimal_interval, 2.0)
    assert_equal 3.hours.to_i, interval
  end

  test "calculate_optimal_interval caps low frequency feeds at MAX_POLL_INTERVAL" do
    # A weekly feed (0.14/day) must not be parked for days
    interval = @low_frequency.send(:calculate_optimal_interval, 1.0 / 7)
    assert_equal Feed::MAX_POLL_INTERVAL, interval
  end

  test "calculate_optimal_interval clamps to MIN_POLL_INTERVAL" do
    # Very high frequency -> should clamp to minimum
    interval = @high_frequency.send(:calculate_optimal_interval, 1000.0)
    assert_equal Feed::MIN_POLL_INTERVAL, interval
  end

  test "calculate_optimal_interval clamps to MAX_POLL_INTERVAL" do
    # Very low frequency -> should clamp to maximum
    interval = @low_frequency.send(:calculate_optimal_interval, 0.001)
    assert_equal Feed::MAX_POLL_INTERVAL, interval
  end

  test "calculate_optimal_interval returns max for zero posts per day" do
    interval = @new_feed.send(:calculate_optimal_interval, 0.0)
    assert_equal Feed::MAX_POLL_INTERVAL, interval
  end

  test "effective_poll_interval_seconds respects manual override" do
    # Manual override is 60 minutes = 3600 seconds
    interval = @manual_override.effective_poll_interval_seconds
    assert_equal 3600, interval
  end

  test "effective_poll_interval_seconds uses calculated interval when no override" do
    @high_frequency.calculated_interval_seconds = 1800
    interval = @high_frequency.effective_poll_interval_seconds
    assert_equal 1800, interval
  end

  test "effective_poll_interval_seconds uses default for new feeds" do
    interval = @new_feed.effective_poll_interval_seconds
    assert_equal Feed::DEFAULT_NEW_FEED_INTERVAL, interval
  end

  test "update_polling_stats! updates last_new_entry_at when new entries" do
    freeze_time do
      @new_feed.update_polling_stats!(5)
      assert_equal Time.current, @new_feed.last_new_entry_at
    end
  end

  test "update_polling_stats! sets next_poll_at" do
    freeze_time do
      @new_feed.update_polling_stats!(0)
      assert_not_nil @new_feed.next_poll_at
      assert @new_feed.next_poll_at > Time.current
    end
  end

  test "update_polling_stats! leaves last_new_entry_at alone when nothing new arrived" do
    before = @high_frequency.last_new_entry_at

    @high_frequency.update_polling_stats!(0)

    assert_equal before.to_i, @high_frequency.last_new_entry_at.to_i
  end

  test "update_polling_stats! calculates interval based on frequency" do
    # 60 posts over the 30-day window is 2/day, so 24h / (4 * 2) = 3 hours
    create_recent_entries(@new_feed, 60)

    @new_feed.update_polling_stats!(0)

    assert_in_delta 2.0, @new_feed.avg_posts_per_day, 0.001
    assert_equal 3.hours.to_i, @new_feed.calculated_interval_seconds
  end

  test "update_polling_stats! lowers avg_posts_per_day for a feed that has gone quiet" do
    # The stored average is a 30-day rolling figure, so it has to roll down as
    # the window slides past old posts. Recalculating only when new entries
    # arrived pinned a formerly busy feed at its old rate indefinitely.
    @high_frequency.update!(avg_posts_per_day: 10.0)

    @high_frequency.update_polling_stats!(0)

    # Two fixture entries inside the window: 2 / 30 days
    assert_in_delta 2 / 30.0, @high_frequency.avg_posts_per_day, 0.001
    assert_equal Feed::MAX_POLL_INTERVAL, @high_frequency.calculated_interval_seconds
  end

  test "update_polling_stats! drops a feed with no entries in the window to zero" do
    @low_frequency.update!(avg_posts_per_day: 5.0, calculated_interval_seconds: 1.hour.to_i)

    @low_frequency.update_polling_stats!(0)

    assert_equal 0.0, @low_frequency.avg_posts_per_day
    assert_equal Feed::MAX_POLL_INTERVAL, @low_frequency.calculated_interval_seconds
  end

  test "calculate_avg_posts_per_day reports zero for feeds with no recent entries" do
    # No synthetic floor: an empty window means no posts, not 0.01/day
    assert_equal 0.0, @low_frequency.send(:calculate_avg_posts_per_day)
  end

  test "recalculate_polling_interval! pulls in a next_poll_at beyond the new interval" do
    @low_frequency.update!(next_poll_at: 5.days.from_now, calculated_interval_seconds: 7.days.to_i)

    @low_frequency.recalculate_polling_interval!

    assert_equal Feed::MAX_POLL_INTERVAL, @low_frequency.calculated_interval_seconds
    assert @low_frequency.next_poll_at <= Time.current + Feed::MAX_POLL_INTERVAL
  end

  test "recalculate_polling_interval! leaves an earlier next_poll_at alone" do
    soon = 1.minute.from_now
    @low_frequency.update!(next_poll_at: soon)

    @low_frequency.recalculate_polling_interval!

    assert_in_delta soon.to_i, @low_frequency.next_poll_at.to_i, 1
  end

  test "recalculate_polling_interval! does not schedule a feed that has never polled" do
    @new_feed.update!(next_poll_at: nil, calculated_interval_seconds: 7.days.to_i)

    @new_feed.recalculate_polling_interval!

    assert_nil @new_feed.next_poll_at
    assert_equal Feed::MAX_POLL_INTERVAL, @new_feed.calculated_interval_seconds
  end

  test "recalculate_polling_interval! respects manual override" do
    @manual_override.update!(next_poll_at: 5.days.from_now)

    @manual_override.recalculate_polling_interval!

    assert @manual_override.next_poll_at <= Time.current + 60.minutes
  end

  # ==========================================
  # Failure tracking and backoff
  #
  # Before record_failure! existed, a fetch error wrote last_error and touched
  # nothing else: consecutive_failures stayed 0 (only the 429 path ever moved
  # it) and next_poll_at kept its stale past value, so the scheduler re-enqueued
  # the feed on the very next tick, forever.
  # ==========================================

  test "record_failure! counts the streak" do
    fail_times(@new_feed, 3)

    assert_equal 3, @new_feed.reload.consecutive_failures
  end

  test "record_failure! keeps the error text" do
    @new_feed.record_failure!("getaddrinfo: Name or service not known")

    assert_equal "getaddrinfo: Name or service not known", @new_feed.reload.last_error
  end

  # The whole reported symptom: a broken feed being retried every 5 minutes.
  # Fails if record_failure! stops moving next_poll_at.
  test "record_failure! pushes next_poll_at into the future" do
    @new_feed.update!(next_poll_at: 1.hour.ago)

    @new_feed.record_failure!("boom")

    assert @new_feed.reload.next_poll_at > Time.current,
      "a failed feed must not still be due; next_poll_at was #{@new_feed.next_poll_at}"
  end

  test "the retry delay grows with the streak instead of staying flat" do
    delays = (1..5).map do
      @new_feed.record_failure!("boom")
      @new_feed.next_poll_at - Time.current
    end

    assert_equal delays.sort, delays, "delays must be non-decreasing, got #{delays.inspect}"
    assert delays.last > delays.first * 10,
      "the fifth delay (#{delays.last}s) should dwarf the first (#{delays.first}s)"
  end

  test "the retry delay caps rather than growing without bound" do
    fail_times(@new_feed, Feed::BACKOFF_DELAYS.length + 4)

    assert_in_delta Feed::BACKOFF_DELAYS.last.to_i,
      @new_feed.next_poll_at - Time.current, 60
  end

  test "record_failure! stamps first_failed_at once and then leaves it alone" do
    @new_feed.record_failure!("boom")
    started = @new_feed.first_failed_at

    travel 2.hours do
      @new_feed.record_failure!("boom again")
    end

    assert_equal started.to_i, @new_feed.reload.first_failed_at.to_i,
      "first_failed_at marks the start of the streak, not the latest attempt"
  end

  test "failing_for reports how long the streak has run" do
    @new_feed.update!(first_failed_at: 3.days.ago)

    assert_in_delta 3.days.to_i, @new_feed.failing_for, 60
  end

  test "failing_for is nil for a feed that is not failing" do
    assert_nil @new_feed.failing_for
  end

  # ==========================================
  # broken? threshold
  # ==========================================

  test "a feed below the threshold is not called broken" do
    fail_times(@new_feed, Feed::BROKEN_AFTER_CONSECUTIVE_FAILURES - 1)

    assert_not @new_feed.broken?
  end

  test "a feed at the threshold is called broken" do
    fail_times(@new_feed, Feed::BROKEN_AFTER_CONSECUTIVE_FAILURES)

    assert @new_feed.broken?
  end

  test "the broken scope finds exactly the feeds past the threshold" do
    fail_times(@new_feed, Feed::BROKEN_AFTER_CONSECUTIVE_FAILURES)
    fail_times(@high_frequency, Feed::BROKEN_AFTER_CONSECUTIVE_FAILURES - 1)

    assert_equal [ @new_feed.id ], Feed.broken.pluck(:id)
  end

  # The threshold has to cost real elapsed time, not just five quick attempts,
  # or a single bad afternoon brands a feed broken.
  test "reaching the threshold takes hours of backoff, not minutes" do
    total = (1...Feed::BROKEN_AFTER_CONSECUTIVE_FAILURES).sum do |n|
      @new_feed.consecutive_failures = n
      @new_feed.failure_backoff_delay.to_i
    end

    assert total > 4.hours.to_i,
      "a feed reaches broken? after only #{total / 3600.0}h of failing"
  end

  # ==========================================
  # Recovery
  # ==========================================

  test "reset_backoff! clears the whole streak so a recovered feed looks healthy" do
    fail_times(@new_feed, 4)

    @new_feed.reset_backoff!

    assert_equal 0, @new_feed.reload.consecutive_failures
    assert_nil @new_feed.first_failed_at
    assert_nil @new_feed.retry_after
    assert_not @new_feed.broken?
  end

  # The early return exists to skip a write on the common healthy path. It must
  # not skip one when there is still state to clear.
  test "reset_backoff! still clears when only first_failed_at is set" do
    @new_feed.update!(consecutive_failures: 0, retry_after: nil, first_failed_at: 2.days.ago)

    @new_feed.reset_backoff!

    assert_nil @new_feed.reload.first_failed_at
  end

  # ==========================================
  # Fixing the URL clears the state
  # ==========================================

  test "editing the feed url clears the failing streak" do
    fail_times(@new_feed, 6)

    @new_feed.update!(feed_url: "https://example.com/moved.rss")

    assert_equal 0, @new_feed.reload.consecutive_failures
    assert_equal "", @new_feed.last_error
    assert_nil @new_feed.first_failed_at
    assert_not @new_feed.broken?
  end

  test "editing the feed url makes the feed due again immediately" do
    fail_times(@new_feed, 6)
    assert @new_feed.next_poll_at > 1.hour.from_now, "precondition: parked on the backoff cap"

    @new_feed.update!(feed_url: "https://example.com/moved.rss")

    assert_nil @new_feed.reload.next_poll_at,
      "a corrected feed must not stay parked on the backoff it earned at the old URL"
  end

  test "editing something other than the url leaves the streak alone" do
    fail_times(@new_feed, 3)

    @new_feed.update!(title: "Renamed")

    assert_equal 3, @new_feed.reload.consecutive_failures
  end

  private

  # Drive +feed+ through +count+ consecutive failures.
  def fail_times(feed, count)
    count.times { |i| feed.record_failure!("boom #{i}") }
    feed
  end

  # Attach +count+ entries published inside the rolling average window to +feed+
  # so calculate_avg_posts_per_day has something to count.
  def create_recent_entries(feed, count)
    count.times do |i|
      entry = Entry.create!(
        guid: "rolling-#{feed.id}-#{i}",
        title: "Rolling entry #{i}",
        link: "https://example.com/rolling/#{i}",
        content: "body",
        content_hash: "rolling-hash-#{feed.id}-#{i}",
        updated: i.hours.ago,
        date_entered: Time.current,
        date_updated: Time.current
      )

      UserEntry.create!(entry: entry, feed: feed, user: feed.user, uuid: SecureRandom.uuid)
    end
  end
end
