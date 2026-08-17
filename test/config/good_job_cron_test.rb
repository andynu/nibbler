require "test_helper"

# Guards the GoodJob cron wiring in config/initializers/good_job.rb.
#
# The morning sweep is the only guarantee that a feed gets refreshed on a
# schedule Andy can predict: the */5 update_feeds entry only picks feeds due
# under adaptive polling, so a feed whose next_poll_at drifted out stays stale.
# Two things here are easy to break silently -- the trailing timezone field
# (fugit parses it, plain cron does not) and the kwargs plumbing that turns
# into UpdateFeedsJob#perform(force: true).
class GoodJobCronTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  def cron
    Rails.application.config.good_job.cron
  end

  test "morning feed sweep cron entry is registered" do
    entry = cron[:refresh_all_feeds_morning]

    assert entry, "refresh_all_feeds_morning cron entry is missing"
    assert_equal "UpdateFeedsJob", entry[:class]
    assert_equal({ force: true }, entry[:kwargs],
      "sweep must pass force: true or it degrades into the ordinary adaptive-polling run")
  end

  test "morning feed sweep fires once a day at 6am Eastern" do
    entry = GoodJob::CronEntry.new(cron[:refresh_all_feeds_morning].merge(key: :refresh_all_feeds_morning))

    assert_equal "America/New_York", entry.send(:fugit).zone,
      "cron must carry an explicit zone; the app itself runs in UTC"

    fire_times = entry.send(:fugit).within(2.days.from_now..3.days.from_now)

    assert_equal 1, fire_times.length, "expected exactly one fire per day, got #{fire_times.length}"
    assert_equal 6, fire_times.first.to_t.in_time_zone("America/New_York").hour
  end

  test "morning feed sweep enqueues UpdateFeedsJob with force: true" do
    entry = GoodJob::CronEntry.new(cron[:refresh_all_feeds_morning].merge(key: :refresh_all_feeds_morning))

    assert_enqueued_with(job: UpdateFeedsJob, args: [ { force: true } ]) do
      entry.enqueue(Time.current)
    end
  end
end
