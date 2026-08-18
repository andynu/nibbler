# Job to update a single feed
# Handles errors with exponential backoff
#
# Rate limiting here is per domain and never blocks a worker thread. The
# scheduler enqueues one of these per due feed (73 of them per 5-minute cycle
# in production) into a pool of a handful of threads, so a job that sleeps is
# a job that stops the whole pool from draining. When a feed's domain was
# requested too recently the job reschedules itself for the moment the domain
# frees up and returns, leaving the thread to pick up the next feed.
class UpdateFeedJob < ApplicationJob
  queue_as :default

  # How many times a job may reschedule itself around a busy domain before it
  # falls back to blocking. Bounds the reschedule loop for a domain with more
  # feeds than the deferral budget; each pass lets exactly one feed through,
  # so only the tail of a large same-domain group ever blocks.
  MAX_DEFERRALS = 5

  # Retry with exponential backoff on network errors
  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  def perform(feed_id, deferrals: 0)
    feed = Feed.find_by(id: feed_id)
    return unless feed

    # Skip if already being updated (prevent concurrent updates). Same window
    # as the scheduler's not_updating scope, so a feed the scheduler considered
    # free is never dropped here.
    return if feed.update_in_progress?

    # Skip if feed is in backoff period (rate limited)
    if feed.in_backoff?
      Rails.logger.info "Skipping feed #{feed.id} (#{feed.title}): in backoff until #{feed.retry_after}"
      return
    end

    return if defer_for_busy_domain(feed, deferrals)

    result = fetch(feed)

    if result.success?
      Rails.logger.info "Updated feed #{feed.id} (#{feed.title}): #{result.new_entries_count} new entries"
    elsif result.rate_limited?
      Rails.logger.warn "Rate limited on feed #{feed.id} (#{feed.title}): backoff until #{feed.retry_after}"
    else
      Rails.logger.warn "Failed to update feed #{feed.id} (#{feed.title}): #{result.error}"
    end
  end

  private

  # Re-enqueues the job for when the feed's domain is next free, and reports
  # whether it did so. Returns false (go ahead and fetch) when the domain is
  # already free, or when the deferral budget is spent and blocking briefly is
  # the lesser evil.
  def defer_for_busy_domain(feed, deferrals)
    delay = DomainThrottler.delay_for(feed.feed_url)
    return false unless delay.positive?

    if deferrals >= MAX_DEFERRALS
      DomainThrottler.wait_for(feed.feed_url)
      return false
    end

    self.class.set(wait: delay.seconds).perform_later(feed.id, deferrals: deferrals + 1)
    Rails.logger.info "Deferring feed #{feed.id} (#{feed.title}) by #{delay.round(1)}s: domain requested too recently"
    true
  end

  def fetch(feed)
    FeedUpdater.new(feed).update
  ensure
    # Record the attempt rather than only the success. A fetch that raised
    # still hit the server, and retry_on would otherwise re-request it with no
    # domain delay at all.
    DomainThrottler.record(feed.feed_url)
  end
end
