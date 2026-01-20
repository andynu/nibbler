module Api
  module V1
    class TagsController < BaseController
      before_action :set_tag, only: [ :show, :update, :destroy ]

      # GET /api/v1/tags
      # Returns list of tags with entry counts for the current user
      def index
        @tags = current_user.tags

        render json: @tags.map { |tag| tag_json(tag) }
      end

      # GET /api/v1/tags/:id
      def show
        render json: tag_json(@tag)
      end

      # POST /api/v1/tags
      def create
        @tag = current_user.tags.build(tag_params)

        if @tag.save
          render json: tag_json(@tag), status: :created
        else
          render json: { errors: @tag.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/tags/:id
      def update
        if @tag.update(tag_params)
          render json: tag_json(@tag)
        else
          render json: { errors: @tag.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/tags/:id
      def destroy
        @tag.destroy
        head :no_content
      end

      private

      def set_tag
        @tag = current_user.tags.find(params[:id])
      end

      def tag_params
        params.require(:tag).permit(:name, :fg_color, :bg_color)
      end

      def tag_json(tag)
        {
          id: tag.id,
          name: tag.name,
          fg_color: tag.fg_color,
          bg_color: tag.bg_color,
          entry_count: tag.entries.count
        }
      end
    end
  end
end
