module Api
  module V1
    class LabelsController < BaseController
      before_action :set_label, only: [:show, :update, :destroy]

      # GET /api/v1/labels
      def index
        @labels = current_user.labels

        render json: @labels.map { |label| label_json(label) }
      end

      # GET /api/v1/labels/:id
      def show
        render json: label_json(@label)
      end

      # POST /api/v1/labels
      def create
        @label = current_user.labels.build(label_params)

        if @label.save
          render json: label_json(@label), status: :created
        else
          render json: { errors: @label.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/labels/:id
      def update
        if @label.update(label_params)
          render json: label_json(@label)
        else
          render json: { errors: @label.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/labels/:id
      def destroy
        @label.destroy
        head :no_content
      end

      private

      def set_label
        @label = current_user.labels.find(params[:id])
      end

      def label_params
        params.require(:label).permit(:caption, :fg_color, :bg_color)
      end

      def label_json(label)
        {
          id: label.id,
          caption: label.caption,
          fg_color: label.fg_color,
          bg_color: label.bg_color,
          entry_count: label.entries.count
        }
      end
    end
  end
end
