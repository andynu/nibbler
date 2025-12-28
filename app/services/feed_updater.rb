# Orchestrates feed fetching, parsing, and entry creation
# Handles deduplication and user entry creation
class FeedUpdater
  class UpdateResult
    attr_reader :feed, :new_entries_count, :status, :error

    def initialize(feed:, new_entries_count: 0, status:, error: nil)
      @feed = feed
      @new_entries_count = new_entries_count
      @status = status
      @error = error
    end

    def success?
      status == :ok || status == :not_modified
    end

    def rate_limited?
      status == :rate_limited
    end
  end

  # Set to true to use disk cache (avoids hammering live feeds during dev)
  class_attribute :use_cache, default: Rails.env.development?

  def initialize(feed)
    @feed = feed
  end

  def update
    @feed.update!(last_update_started: Time.current)

    fetcher = use_cache ? CachedFeedFetcher.new(@feed) : FeedFetcher.new(@feed)
    fetch_result = fetcher.fetch

    if fetch_result.rate_limited?
      return handle_rate_limited(fetch_result)
    end

    if fetch_result.error?
      return handle_error(fetch_result.error)
    end

    if fetch_result.not_modified?
      return handle_not_modified
    end

    parse_result = FeedParser.new(fetch_result.body, feed_url: @feed.feed_url).parse

    if !parse_result.success?
      return handle_error(parse_result.error)
    end

    process_entries(parse_result, fetch_result)
  end

  private

  def handle_error(error)
    @feed.update!(last_error: error)
    UpdateResult.new(feed: @feed, status: :error, error: error)
  end

  def handle_rate_limited(fetch_result)
    @feed.apply_backoff!(fetch_result.retry_after)
    @feed.update!(last_error: fetch_result.error)
    UpdateResult.new(feed: @feed, status: :rate_limited, error: fetch_result.error)
  end

  def handle_not_modified
    @feed.reset_backoff!
    @feed.update!(
      last_updated: Time.current,
      last_successful_update: Time.current,
      last_error: ""
    )

    # Update next poll time even when not modified
    @feed.update_polling_stats!(0)

    UpdateResult.new(feed: @feed, status: :not_modified)
  end

  def process_entries(parse_result, fetch_result)
    new_count = 0

    ActiveRecord::Base.transaction do
      # Reset backoff on successful fetch
      @feed.reset_backoff!

      # Update feed metadata if changed
      update_feed_metadata(parse_result, fetch_result)

      # Process each entry
      parse_result.entries.each do |parsed_entry|
        if create_entry(parsed_entry)
          new_count += 1
        end
      end
    end

    # Update adaptive polling statistics
    @feed.update_polling_stats!(new_count)

    UpdateResult.new(feed: @feed, new_entries_count: new_count, status: :ok)
  rescue StandardError => e
    handle_error("Database error: #{e.message}")
  end

  def update_feed_metadata(parse_result, fetch_result)
    updates = {
      last_updated: Time.current,
      last_successful_update: Time.current,
      last_error: ""
    }

    # Update site URL if we got one
    if parse_result.site_url.present? && @feed.site_url.blank?
      updates[:site_url] = parse_result.site_url
    end

    # Store caching headers for conditional GET
    if fetch_result.last_modified.present?
      updates[:last_modified] = fetch_result.last_modified
    end

    if fetch_result.etag.present?
      updates[:etag] = fetch_result.etag
    end

    @feed.update!(updates)
  end

  def create_entry(parsed_entry)
    # Skip entries without a valid link - some feeds have broken entries
    if parsed_entry.link.blank?
      Rails.logger.debug { "Skipping entry without link: #{parsed_entry.guid}" }
      return false
    end

    # Check if entry already exists globally (by GUID)
    entry = Entry.find_by(guid: parsed_entry.guid)

    if entry.nil?
      # Create new global entry
      entry = Entry.create!(
        guid: parsed_entry.guid,
        title: parsed_entry.title,
        link: parsed_entry.link,
        content: parsed_entry.content,
        content_hash: Digest::SHA256.hexdigest(parsed_entry.content),
        author: parsed_entry.author || "",
        updated: parsed_entry.updated || Time.current,
        date_entered: Time.current,
        date_updated: Time.current
      )

      # Create enclosures
      parsed_entry.enclosures.each do |enc|
        Enclosure.create!(
          entry: entry,
          content_url: enc.url,
          content_type: enc.type,
          title: enc.title || "",
          duration: ""
        )
      end
    end

    # Check if user already has this entry
    user_entry = UserEntry.find_by(user: @feed.user, entry: entry)

    if user_entry.nil?
      # Create user entry
      user_entry = UserEntry.create!(
        entry: entry,
        feed: @feed,
        user: @feed.user,
        uuid: SecureRandom.uuid,
        unread: true,
        tag_cache: parsed_entry.categories.join(",")
      )

      # Execute user's filters on the new entry
      FilterExecutor.execute(user_entry)

      true # New entry for this user
    else
      false # Already had this entry
    end
  end
end
