module Api
  module V1
    class FeedsController < BaseController
      before_action :set_feed, only: [ :show, :update, :destroy, :refresh, :info ]

      # GET /api/v1/feeds
      def index
        @feeds = current_user.feeds.includes(:category).ordered

        render json: @feeds.map { |feed| feed_json(feed) }
      end

      # GET /api/v1/feeds/:id
      def show
        render json: feed_json(@feed, include_entries: true)
      end

      # POST /api/v1/feeds
      def create
        @feed = current_user.feeds.build(feed_params)

        if @feed.save
          # Optionally fetch the feed immediately
          FeedUpdater.new(@feed).update if params[:fetch_now]
          render json: feed_json(@feed), status: :created
        else
          render json: { errors: @feed.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/feeds/:id
      def update
        if @feed.update(feed_params)
          render json: feed_json(@feed)
        else
          render json: { errors: @feed.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/feeds/:id
      def destroy
        @feed.destroy
        head :no_content
      end

      # POST /api/v1/feeds/:id/refresh
      # Manual refresh respects backoff (rate limited feeds) but allows override of normal intervals
      def refresh
        # Respect backoff period for rate-limited feeds
        if @feed.in_backoff?
          return render json: {
            error: "Feed is rate-limited, please wait before refreshing",
            retry_after: @feed.retry_after&.iso8601,
            seconds_remaining: [(@feed.retry_after - Time.current).to_i, 0].max
          }, status: :too_many_requests
        end

        # Prevent concurrent updates (5 minute window)
        if @feed.last_update_started.present? && @feed.last_update_started > 1.minute.ago
          return render json: {
            error: "Feed is currently being updated",
            last_update_started: @feed.last_update_started.iso8601
          }, status: :conflict
        end

        result = FeedUpdater.new(@feed).update

        if result.success?
          render json: {
            status: result.status,
            new_entries: result.new_entries_count,
            feed: feed_json(@feed.reload)
          }
        else
          render json: { error: result.error }, status: :unprocessable_entity
        end
      end

      # GET /api/v1/feeds/:id/info
      # Returns detailed feed info and stats
      def info
        # Get entry stats
        entries = @feed.entries.order(updated: :desc)
        entry_count = entries.count
        oldest_entry = entries.last
        newest_entry = entries.first

        # Calculate posting frequency from last 30 days
        recent_count = entries.where("updated > ?", 30.days.ago).count
        posts_per_day = entry_count > 0 ? recent_count / 30.0 : 0

        # Get posting frequency by day of week and hour (PostgreSQL syntax)
        recent_entries = @feed.entries.where("updated > ?", 90.days.ago)
        frequency_by_hour = recent_entries
          .group("EXTRACT(HOUR FROM updated)::integer")
          .count
          .transform_keys { |k| k.to_i }

        frequency_by_day = recent_entries
          .group("EXTRACT(DOW FROM updated)::integer")
          .count
          .transform_keys { |k| k.to_i }

        render json: {
          id: @feed.id,
          title: @feed.title,
          feed_url: @feed.feed_url,
          site_url: @feed.site_url,
          icon_url: @feed.icon_url,
          category_title: @feed.category&.title,

          # Sync info
          last_updated: @feed.last_updated,
          last_successful_update: @feed.last_successful_update,
          next_poll_at: @feed.next_poll_at,
          etag: @feed.etag,
          last_modified: @feed.last_modified,
          last_error: @feed.last_error.presence,

          # Polling interval
          update_interval: @feed.update_interval,
          calculated_interval_seconds: @feed.calculated_interval_seconds,
          avg_posts_per_day: @feed.avg_posts_per_day,

          # Entry stats
          entry_count: entry_count,
          oldest_entry_date: oldest_entry&.updated,
          newest_entry_date: newest_entry&.updated,
          posts_per_day: posts_per_day.round(2),

          # Frequency data for chart
          frequency_by_hour: frequency_by_hour,
          frequency_by_day: frequency_by_day,

          # Word frequency for categorization hints
          top_words: WordFrequencyAnalyzer.new(@feed).analyze
        }
      end

      # POST /api/v1/feeds/preview
      # Fetches and parses a feed URL without subscribing
      def preview
        url = params[:url].to_s.strip
        return render json: { error: "URL is required" }, status: :bad_request if url.blank?

        # Normalize URL - add https:// if no protocol specified
        url = "https://#{url}" unless url.match?(%r{\Ahttps?://}i)

        begin
          # Create a temporary feed object to use with FeedFetcher
          temp_feed = Feed.new(feed_url: url)
          fetcher = FeedFetcher.new(temp_feed)
          fetch_result = fetcher.fetch

          if fetch_result.error?
            return render json: { error: fetch_result.error }, status: :unprocessable_entity
          end

          parse_result = FeedParser.new(fetch_result.body, feed_url: url).parse

          if !parse_result.success?
            return render json: { error: parse_result.error }, status: :unprocessable_entity
          end

          # Calculate last updated from entries
          last_entry_date = parse_result.entries
            .map { |e| e.updated || e.published }
            .compact
            .max

          render json: {
            title: parse_result.title,
            site_url: parse_result.site_url,
            feed_url: url,
            entry_count: parse_result.entries.count,
            last_updated: last_entry_date,
            sample_entries: parse_result.entries.first(3).map do |entry|
              { title: entry.title, published: entry.published }
            end
          }
        rescue StandardError => e
          render json: { error: "Failed to fetch feed: #{e.message}" }, status: :unprocessable_entity
        end
      end

      # POST /api/v1/feeds/refresh_all
      def refresh_all
        feeds = current_user.feeds.where("last_updated IS NULL OR last_updated < ?", 5.minutes.ago)
        results = []

        feeds.find_each do |feed|
          result = FeedUpdater.new(feed).update
          results << {
            feed_id: feed.id,
            title: feed.title,
            status: result.status,
            new_entries: result.new_entries_count,
            error: result.error
          }
        end

        render json: { updated: results.count, results: results }
      end

      private

      def set_feed
        @feed = current_user.feeds.find(params[:id])
      end

      def feed_params
        params.require(:feed).permit(
          :title, :feed_url, :category_id, :site_url,
          :update_interval, :purge_interval, :hidden,
          :cache_images, :mark_unread_on_update,
          :include_in_digest, :always_display_enclosures
        )
      end

      def feed_json(feed, include_entries: false)
        json = {
          id: feed.id,
          title: feed.title,
          feed_url: feed.feed_url,
          site_url: feed.site_url,
          category_id: feed.category_id,
          category_title: feed.category&.title,
          icon_url: feed.icon_url,
          last_updated: feed.last_updated,
          last_successful_update: feed.last_successful_update,
          last_error: feed.last_error.presence,
          unread_count: feed.user_entries.unread.count,
          entry_count: feed.entry_count,
          oldest_entry_date: feed.oldest_entry_date,
          newest_entry_date: feed.newest_entry_date,
          update_interval: feed.update_interval,
          purge_interval: feed.purge_interval,
          hidden: feed.hidden,
          cache_images: feed.cache_images,
          mark_unread_on_update: feed.mark_unread_on_update,
          include_in_digest: feed.include_in_digest,
          always_display_enclosures: feed.always_display_enclosures
        }

        if include_entries
          json[:entries] = feed.user_entries
            .includes(:entry)
            .recent
            .limit(50)
            .map { |ue| user_entry_json(ue) }
        end

        json
      end

      def user_entry_json(user_entry)
        entry = user_entry.entry
        {
          id: user_entry.id,
          entry_id: entry.id,
          title: entry.title,
          link: entry.link,
          author: entry.author,
          published: entry.updated,
          unread: user_entry.unread,
          starred: user_entry.marked,
          score: user_entry.score
        }
      end
    end
  end
end
