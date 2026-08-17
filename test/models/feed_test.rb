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

  test "update_polling_stats! calculates interval based on frequency" do
    @high_frequency.update_polling_stats!(0)
    assert_not_nil @high_frequency.calculated_interval_seconds
    # High frequency feed should have short interval
    assert @high_frequency.calculated_interval_seconds < 6.hours.to_i
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
end
