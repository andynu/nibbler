module Api
  module V1
    # Legacy endpoint for tag management (previously "labels")
    # TODO: Rename to /api/v1/tags after frontend migration
    class LabelsController < BaseController
      before_action :set_tag, only: [ :show, :update, :destroy ]

      # GET /api/v1/labels
      def index
        @tags = current_user.tags

        render json: @tags.map { |tag| tag_json(tag) }
      end

      # GET /api/v1/labels/:id
      def show
        render json: tag_json(@tag)
      end

      # POST /api/v1/labels
      def create
        @tag = current_user.tags.build(tag_params)

        if @tag.save
          render json: tag_json(@tag), status: :created
        else
          render json: { errors: @tag.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/labels/:id
      def update
        if @tag.update(tag_params)
          render json: tag_json(@tag)
        else
          render json: { errors: @tag.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/labels/:id
      def destroy
        @tag.destroy
        head :no_content
      end

      private

      def set_tag
        @tag = current_user.tags.find(params[:id])
      end

      def tag_params
        # Accept both old (caption) and new (name) field names
        permitted = params.require(:label).permit(:caption, :name, :fg_color, :bg_color)
        # Normalize caption to name if present
        if permitted[:caption].present? && permitted[:name].blank?
          permitted[:name] = permitted.delete(:caption)
        end
        permitted.except(:caption)
      end

      def tag_json(tag)
        {
          id: tag.id,
          caption: tag.name,  # Keep caption for backwards compatibility
          name: tag.name,
          fg_color: tag.fg_color,
          bg_color: tag.bg_color,
          entry_count: tag.entries.count
        }
      end
    end
  end
end
