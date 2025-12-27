module Api
  module V1
    class OpmlController < BaseController
      # POST /api/v1/opml/import
      def import
        unless params[:file]
          return render json: { error: "No file provided" }, status: :bad_request
        end

        opml_content = params[:file].read
        importer = OpmlImporter.new(current_user, opml_content)
        result = importer.import

        if result.success?
          render json: {
            success: true,
            summary: result.summary,
            feeds_created: result.feeds_created,
            feeds_skipped: result.feeds_skipped,
            categories_created: result.categories_created
          }
        else
          render json: {
            success: false,
            errors: result.errors,
            feeds_created: result.feeds_created,
            feeds_skipped: result.feeds_skipped
          }, status: :unprocessable_entity
        end
      end

      # POST /api/v1/opml/preview
      def preview
        unless params[:file]
          return render json: { error: "No file provided" }, status: :bad_request
        end

        opml_content = params[:file].read
        importer = OpmlImporter.new(current_user, opml_content)
        result = importer.parse  # Parse only - do not import!

        existing_urls = current_user.feeds.pluck(:feed_url).to_set

        feeds = result.feeds.map do |feed|
          {
            title: feed.title,
            feed_url: feed.feed_url,
            site_url: feed.site_url,
            category_path: feed.category_path.join(" / "),
            exists: existing_urls.include?(feed.feed_url)
          }
        end

        render json: {
          feeds: feeds,
          total: feeds.size,
          new_feeds: feeds.count { |f| !f[:exists] },
          existing_feeds: feeds.count { |f| f[:exists] },
          errors: result.errors
        }
      rescue => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      # GET /api/v1/opml/export
      def export
        exporter = OpmlExporter.new(current_user)
        opml_content = exporter.export

        send_data opml_content,
          filename: "nibbler-subscriptions-#{Date.current.iso8601}.opml",
          type: "application/xml",
          disposition: "attachment"
      end
    end
  end
end
