# Fetches Google News RSS for every query on a single Story and inserts
# new articles into story_articles.
#
# Dedup is handled by the unique (story_id, url) index: rather than checking
# first, we rescue ActiveRecord::RecordNotUnique and skip. This keeps the
# code simple and race-free across concurrent runs.
#
# Errors on an individual query are logged but do not abort the remaining
# queries on the story - the next scheduled run will retry them.
#
# @see FetchStoriesJob for the scheduler that enqueues one of these per active Story
# @see GoogleNewsRssFetcher for the underlying HTTP client
class FetchStoryArticlesJob < ApplicationJob
  queue_as :default

  # Seconds to sleep between queries to Google News, to stay under their rate
  # ceiling. Google doesn't publish a limit, but in practice ~1 rps is safe.
  # Overridable per class for tests (see FetchStoryArticlesJob.inter_query_delay=).
  class << self
    attr_accessor :inter_query_delay
  end
  self.inter_query_delay = 1.5

  # Retry on transient errors with exponential backoff, matching UpdateFeedJob.
  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  def perform(story_id)
    story = Story.find_by(id: story_id)
    return unless story
    return unless story.active?

    queries = Array(story.queries).map(&:to_s).reject(&:empty?)
    if queries.empty?
      Rails.logger.info "FetchStoryArticlesJob: story #{story.id} has no queries, skipping"
      return
    end

    total_new = 0
    delay = self.class.inter_query_delay.to_f
    queries.each_with_index do |query, index|
      total_new += fetch_query(story, query)
      sleep(delay) if delay.positive? && index < queries.size - 1
    end

    Rails.logger.info "FetchStoryArticlesJob: story #{story.id} (#{story.name}) +#{total_new} articles"
    total_new
  end

  private

  def fetch_query(story, query)
    DomainThrottler.wait_for(GoogleNewsRssFetcher::RSS_BASE)
    items = GoogleNewsRssFetcher.new(query).fetch
    DomainThrottler.record(GoogleNewsRssFetcher::RSS_BASE)

    new_count = 0
    items.each do |item|
      if insert_article(story, item)
        new_count += 1
      end
    end
    new_count
  rescue GoogleNewsRssFetcher::FetchError => e
    Rails.logger.warn "FetchStoryArticlesJob: story #{story.id} query #{query.inspect} fetch failed: #{e.message}"
    0
  end

  def insert_article(story, item)
    story.story_articles.create!(
      url: item.url,
      title: item.title,
      snippet: item.snippet,
      source: item.source,
      published_at: item.published_at,
      fetched_at: Time.current
    )
    true
  rescue ActiveRecord::RecordNotUnique
    false
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.warn "FetchStoryArticlesJob: story #{story.id} skipped invalid item #{item.url.inspect}: #{e.message}"
    false
  end
end
