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
    # Wait until it's safe to make a request to the given URL's domain
    # Returns immediately if enough time has passed, otherwise sleeps
    def wait_for(url)
      domain = extract_domain(url)
      return unless domain

      last_request_time = Rails.cache.read(cache_key(domain))
      return unless last_request_time

      elapsed = Time.current - last_request_time
      sleep(DOMAIN_DELAY - elapsed) if elapsed < DOMAIN_DELAY
      nil
    rescue StandardError => e
      log_cache_failure("wait_for", domain, e)
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
