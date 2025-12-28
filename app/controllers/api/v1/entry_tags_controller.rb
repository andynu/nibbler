module Api
  module V1
    class EntryTagsController < BaseController
      before_action :set_user_entry

      # POST /api/v1/entries/:entry_id/tags
      # Body: { tag_name: "example" } or { tag_names: ["tag1", "tag2"] }
      def create
        tag_names = params[:tag_names].presence || Array(params[:tag_name])

        tag_names.each do |name|
          normalized = name.to_s.strip.downcase
          next if normalized.blank?
          next if @user_entry.tags.exists?(tag_name: normalized)

          @user_entry.tags.create!(tag_name: normalized, user: current_user)
        end

        update_tag_cache
        render_tags
      end

      # DELETE /api/v1/entries/:entry_id/tags/:id
      # :id is the tag_name (URL-encoded)
      def destroy
        tag_name = params[:id].to_s.strip.downcase
        @user_entry.tags.where(tag_name: tag_name).destroy_all

        update_tag_cache
        render_tags
      end

      private

      def set_user_entry
        @user_entry = current_user.user_entries.find(params[:entry_id])
      end

      def update_tag_cache
        tag_list = @user_entry.tags.pluck(:tag_name).sort.join(",")
        @user_entry.update!(tag_cache: tag_list)
      end

      def render_tags
        render json: {
          entry_id: @user_entry.id,
          tags: @user_entry.tags.pluck(:tag_name).sort
        }
      end
    end
  end
end
