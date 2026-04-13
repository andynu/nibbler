module Api
  module V1
    class FeedTagsController < BaseController
      before_action :set_feed

      # GET /api/v1/feeds/:feed_id/tags
      def index
        render json: {
          feed_id: @feed.id,
          tags: @feed.tags.order(:name).map { |t| tag_json(t) }
        }
      end

      # POST /api/v1/feeds/:feed_id/tags
      # Body: { tag_name: "example" }
      def create
        normalized = params[:tag_name].to_s.strip.downcase
        return render json: { error: "Tag name required" }, status: :unprocessable_entity if normalized.blank?

        # Find or create the tag for this user
        tag = current_user.tags.find_or_create_by!(name: normalized) do |t|
          t.bg_color = "#64748b"  # Default slate color
          t.fg_color = "#ffffff"
        end

        # Create feed-level tag association
        feed_tag = FeedTag.find_or_create_by!(feed: @feed, tag: tag)

        # Enqueue batch apply if this is a new association
        if feed_tag.previously_new_record?
          ApplyFeedTagJob.perform_later(feed_id: @feed.id, tag_id: tag.id)
        end

        render_tags
      end

      # DELETE /api/v1/feeds/:feed_id/tags/:id
      # :id is the tag name (URL-encoded)
      def destroy
        tag_name = params[:id].to_s.strip.downcase
        tag = current_user.tags.find_by(name: tag_name)

        if tag
          feed_tag = FeedTag.find_by(feed: @feed, tag: tag)
          if feed_tag
            # Enqueue batch removal before destroying the association
            RemoveFeedTagJob.perform_later(feed_id: @feed.id, tag_id: tag.id)
            feed_tag.destroy
          end
        end

        render_tags
      end

      private

      def set_feed
        @feed = current_user.feeds.find(params[:feed_id])
      end

      def render_tags
        render json: {
          feed_id: @feed.id,
          tags: @feed.tags.order(:name).map { |t| tag_json(t) }
        }
      end

      def tag_json(tag)
        { id: tag.id, name: tag.name, fg_color: tag.fg_color, bg_color: tag.bg_color }
      end
    end
  end
end
