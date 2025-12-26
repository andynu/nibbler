module Api
  module V1
    class EntryLabelsController < BaseController
      before_action :set_user_entry

      # POST /api/v1/entries/:entry_id/labels
      def create
        label = current_user.labels.find(params[:label_id])
        entry = @user_entry.entry

        unless entry.labels.include?(label)
          entry.labels << label
        end

        render json: {
          entry_id: @user_entry.id,
          labels: entry.labels.map { |l| { id: l.id, caption: l.caption } }
        }
      end

      # DELETE /api/v1/entries/:entry_id/labels/:id
      def destroy
        label = current_user.labels.find(params[:id])
        entry = @user_entry.entry

        entry.entry_labels.where(label: label).destroy_all

        render json: {
          entry_id: @user_entry.id,
          labels: entry.labels.map { |l| { id: l.id, caption: l.caption } }
        }
      end

      private

      def set_user_entry
        @user_entry = current_user.user_entries.find(params[:entry_id])
      end
    end
  end
end
