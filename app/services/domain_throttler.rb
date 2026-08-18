# Throttles requests to the same domain to avoid overwhelming servers
# Uses Rails cache to track last request time per domain
#
# Throttling is an optimization, not correctness. If the cache store is
# unavailable (misconfigured backend, missing table, network partition) the
# throttler logs and lets the caller proceed unthrottled rather than taking
# down the job that was about to fetch a feed.
class DomainThrottler
  # Minimum seconds between requests to the same domain
  DOMAIN_DELAY = 5

  class << self
    # Seconds that must still elapse before the given URL's domain may be
    # requested again. Zero means go now.
    #
    # Prefer this over #wait_for anywhere the caller can yield instead of
    # block (a background job can reschedule itself for this many seconds
    # out, freeing its worker thread for another feed in the meantime).
    def delay_for(url)
      domain = extract_domain(url)
      return 0 unless domain

      last_request_time = Rails.cache.read(cache_key(domain))
      return 0 unless last_request_time

      remaining = DOMAIN_DELAY - (Time.current - last_request_time)
      remaining.positive? ? remaining : 0
    rescue StandardError => e
      log_cache_failure("delay_for", domain, e)
      0
    end

    # Block the calling thread until it's safe to request the given URL's
    # domain. Only for callers with nothing else to do with the thread, such
    # as a loop over several queries inside one job.
    def wait_for(url)
      delay = delay_for(url)
      sleep(delay) if delay.positive?
      nil
    end

    # Record that a request to this domain was just completed
    def record(url)
      domain = extract_domain(url)
      return unless domain

      Rails.cache.write(cache_key(domain), Time.current, expires_in: 1.hour)
      nil
    rescue StandardError => e
      log_cache_failure("record", domain, e)
    end

    private

    def extract_domain(url)
      URI.parse(url).host&.downcase
    rescue URI::InvalidURIError
      nil
    end

    def cache_key(domain)
      "domain_throttle:#{domain}"
    end

    def log_cache_failure(operation, domain, error)
      Rails.logger.warn(
        "DomainThrottler##{operation} skipped for #{domain}: cache unavailable (#{error.class}: #{error.message})"
      )
      nil
    end
  end
end
