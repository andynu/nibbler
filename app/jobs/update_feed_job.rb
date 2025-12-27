# Job to update a single feed
# Handles errors with exponential backoff
class UpdateFeedJob < ApplicationJob
  queue_as :default

  # Delay between feed fetches (seconds) to avoid overwhelming servers
  INTER_REQUEST_DELAY = 1.5

  # Retry with exponential backoff on network errors
  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  def perform(feed_id)
    feed = Feed.find_by(id: feed_id)
    return unless feed

    # Skip if already being updated (prevent concurrent updates)
    return if feed.last_update_started && feed.last_update_started > 5.minutes.ago

    # Skip if feed is in backoff period (rate limited)
    if feed.in_backoff?
      Rails.logger.info "Skipping feed #{feed.id} (#{feed.title}): in backoff until #{feed.retry_after}"
      return
    end

    # Wait for domain throttle before making request
    DomainThrottler.wait_for(feed.feed_url)

    result = FeedUpdater.new(feed).update

    # Record request time for domain throttling
    DomainThrottler.record(feed.feed_url)

    if result.success?
      Rails.logger.info "Updated feed #{feed.id} (#{feed.title}): #{result.new_entries_count} new entries"
    elsif result.rate_limited?
      Rails.logger.warn "Rate limited on feed #{feed.id} (#{feed.title}): backoff until #{feed.retry_after}"
    else
      Rails.logger.warn "Failed to update feed #{feed.id} (#{feed.title}): #{result.error}"
    end
  ensure
    # Throttle to avoid overwhelming servers with rapid requests
    sleep(INTER_REQUEST_DELAY) if INTER_REQUEST_DELAY.positive?
  end
end
