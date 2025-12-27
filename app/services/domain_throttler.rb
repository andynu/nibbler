# Throttles requests to the same domain to avoid overwhelming servers
# Uses Rails cache to track last request time per domain
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

      if last_request_time
        elapsed = Time.current - last_request_time
        if elapsed < DOMAIN_DELAY
          sleep(DOMAIN_DELAY - elapsed)
        end
      end
    end

    # Record that a request to this domain was just completed
    def record(url)
      domain = extract_domain(url)
      return unless domain

      Rails.cache.write(cache_key(domain), Time.current, expires_in: 1.hour)
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
  end
end
