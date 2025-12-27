module Api
  module V1
    class TagsController < BaseController
      # GET /api/v1/tags
      # Returns list of unique tag names for the current user
      def index
        tag_names = current_user.tags
          .distinct
          .order(:tag_name)
          .pluck(:tag_name)

        render json: { tags: tag_names }
      end
    end
  end
end
