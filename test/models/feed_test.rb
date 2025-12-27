require "test_helper"

class FeedTest < ActiveSupport::TestCase
  setup do
    @high_frequency = feeds(:high_frequency)
    @low_frequency = feeds(:low_frequency)
    @new_feed = feeds(:new_feed)
    @manual_override = feeds(:manual_override)
  end

  test "calculate_optimal_interval returns short interval for high frequency feeds" do
    # 10 posts per day -> check every 1.2 hours (12 hours / 10 = 4320 seconds)
    interval = @high_frequency.send(:calculate_optimal_interval, 10.0)
    assert_equal 4320, interval
    assert interval >= Feed::MIN_POLL_INTERVAL
    assert interval <= Feed::MAX_POLL_INTERVAL
  end

  test "calculate_optimal_interval returns long interval for low frequency feeds" do
    # 0.1 posts per day (one every 10 days) -> 5 days (12 hours / 0.1 = 120 hours)
    interval = @low_frequency.send(:calculate_optimal_interval, 0.1)
    assert_equal 5.days.to_i, interval
    assert interval >= Feed::MIN_POLL_INTERVAL
    assert interval <= Feed::MAX_POLL_INTERVAL
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
end
