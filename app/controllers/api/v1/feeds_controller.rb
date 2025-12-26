module Api
  module V1
    class FeedsController < BaseController
      before_action :set_feed, only: [:show, :update, :destroy, :refresh]

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
      def refresh
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
          last_error: feed.last_error.presence,
          unread_count: feed.user_entries.unread.count,
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
