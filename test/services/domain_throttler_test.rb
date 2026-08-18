require "test_helper"
require "minitest/mock"

# Guards DomainThrottler's behaviour when the cache store is broken.
#
# Throttling is an optimization; a dead cache backend (missing solid_cache
# table, network partition, misconfigured store) must not abort the feed
# fetch that was about to happen.
class DomainThrottlerTest < ActiveSupport::TestCase
  URL = "https://example.com/feed.xml".freeze
  CACHE_KEY = "domain_throttle:example.com".freeze

  # Stands in for a cache store whose backend is unreachable.
  class BrokenCacheStore
    Unavailable = Class.new(StandardError)

    def read(*) = raise(Unavailable, "relation \"solid_cache_entries\" does not exist")
    def write(*) = raise(Unavailable, "relation \"solid_cache_entries\" does not exist")
  end

  setup do
    @original_cache = Rails.cache
    @original_logger = Rails.logger
    @log = StringIO.new
    Rails.logger = ActiveSupport::Logger.new(@log)
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
  end

  teardown do
    Rails.cache = @original_cache
    Rails.logger = @original_logger
  end

  # ===================
  # Broken cache store
  # ===================

  test "wait_for does not raise when the cache read fails" do
    Rails.cache = BrokenCacheStore.new

    assert_nothing_raised { DomainThrottler.wait_for(URL) }
  end

  test "wait_for logs a warning when the cache read fails" do
    Rails.cache = BrokenCacheStore.new

    DomainThrottler.wait_for(URL)

    assert_includes @log.string, "DomainThrottler#delay_for skipped for example.com"
    assert_includes @log.string, "solid_cache_entries"
  end

  test "delay_for reports no delay when the cache read fails" do
    Rails.cache = BrokenCacheStore.new

    assert_equal 0, DomainThrottler.delay_for(URL)
  end

  test "record does not raise when the cache write fails" do
    Rails.cache = BrokenCacheStore.new

    assert_nothing_raised { DomainThrottler.record(URL) }
  end

  test "record logs a warning when the cache write fails" do
    Rails.cache = BrokenCacheStore.new

    DomainThrottler.record(URL)

    assert_includes @log.string, "DomainThrottler#record skipped for example.com"
  end

  test "wait_for does not sleep when the cache read fails" do
    Rails.cache = BrokenCacheStore.new

    assert_empty capture_sleeps { DomainThrottler.wait_for(URL) }
  end

  test "wait_for survives a corrupt cached value" do
    Rails.cache.write(CACHE_KEY, "not a timestamp")

    assert_nothing_raised { DomainThrottler.wait_for(URL) }
    assert_includes @log.string, "DomainThrottler#delay_for skipped for example.com"
  end

  # ===================
  # Healthy cache store
  # ===================

  test "record stores the request time for the domain" do
    freeze_time do
      DomainThrottler.record(URL)

      assert_equal Time.current, Rails.cache.read(CACHE_KEY)
    end
  end

  test "wait_for sleeps out the remaining delay after a recent request" do
    Rails.cache.write(CACHE_KEY, 2.seconds.ago)

    sleeps = capture_sleeps { DomainThrottler.wait_for(URL) }

    assert_equal 1, sleeps.size
    assert_in_delta DomainThrottler::DOMAIN_DELAY - 2, sleeps.first, 0.5
  end

  test "wait_for returns immediately with no recorded request" do
    assert_empty capture_sleeps { DomainThrottler.wait_for(URL) }
  end

  test "wait_for returns immediately once the delay has elapsed" do
    Rails.cache.write(CACHE_KEY, (DomainThrottler::DOMAIN_DELAY + 1).seconds.ago)

    assert_empty capture_sleeps { DomainThrottler.wait_for(URL) }
  end

  test "throttling is per domain" do
    DomainThrottler.record(URL)

    assert_empty capture_sleeps { DomainThrottler.wait_for("https://other.example.org/feed.xml") }
  end

  # ==========================================
  # delay_for: the non-blocking form used by
  # jobs that reschedule instead of sleeping
  # ==========================================

  test "delay_for reports the remaining delay after a recent request" do
    Rails.cache.write(CACHE_KEY, 2.seconds.ago)

    assert_in_delta DomainThrottler::DOMAIN_DELAY - 2, DomainThrottler.delay_for(URL), 0.5
  end

  test "delay_for reports no delay with no recorded request" do
    assert_equal 0, DomainThrottler.delay_for(URL)
  end

  test "delay_for reports no delay once the delay has elapsed" do
    Rails.cache.write(CACHE_KEY, (DomainThrottler::DOMAIN_DELAY + 1).seconds.ago)

    assert_equal 0, DomainThrottler.delay_for(URL)
  end

  test "delay_for never sleeps" do
    Rails.cache.write(CACHE_KEY, Time.current)

    assert_empty capture_sleeps { DomainThrottler.delay_for(URL) }
  end

  test "delay_for reports no delay for an unusable url" do
    assert_equal 0, DomainThrottler.delay_for("::::")
  end

  # ===================
  # Unusable URLs
  # ===================

  test "invalid urls are ignored without touching the cache" do
    Rails.cache = BrokenCacheStore.new

    assert_nothing_raised do
      DomainThrottler.wait_for("::::")
      DomainThrottler.record("::::")
    end
    assert_empty @log.string
  end

  private

  # Records the durations DomainThrottler would have slept for instead of
  # actually sleeping, so timing behaviour is assertable in milliseconds.
  def capture_sleeps
    slept = []
    DomainThrottler.stub(:sleep, ->(seconds) { slept << seconds }) { yield }
    slept
  end
end
