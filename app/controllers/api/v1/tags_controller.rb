module Api
  module V1
    class TagsController < BaseController
      # GET /api/v1/tags
      # Returns list of tags with entry counts for the current user
      def index
        tags_with_counts = current_user.tags
          .left_joins(:entry_tags)
          .group(:id, :name)
          .order(:name)
          .count("entry_tags.id")

        render json: {
          tags: tags_with_counts.keys.map { |id, name| name },
          tags_with_counts: tags_with_counts.map { |(id, name), count| { name: name, count: count } }
        }
      end
    end
  end
end
