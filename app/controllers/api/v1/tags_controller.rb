module Api
  module V1
    class TagsController < BaseController
      # GET /api/v1/tags
      # Returns list of unique tag names with counts for the current user
      def index
        tags_with_counts = current_user.tags
          .group(:tag_name)
          .order(:tag_name)
          .count

        render json: {
          tags: tags_with_counts.keys,
          tags_with_counts: tags_with_counts.map { |name, count| { name: name, count: count } }
        }
      end
    end
  end
end
