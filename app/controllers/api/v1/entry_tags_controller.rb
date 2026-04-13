module Api
  module V1
    class EntryTagsController < BaseController
      before_action :set_entry

      # POST /api/v1/entries/:entry_id/tags
      # Body: { tag_name: "example" } or { tag_names: ["tag1", "tag2"] }
      def create
        tag_names = params[:tag_names].presence || Array(params[:tag_name])

        tag_names.each do |name|
          normalized = name.to_s.strip.downcase
          next if normalized.blank?

          # Find or create the tag for this user
          tag = current_user.tags.find_or_create_by!(name: normalized) do |t|
            t.bg_color = "#64748b"  # Default slate color
            t.fg_color = "#ffffff"
          end

          # Link tag to entry if not already linked
          EntryTag.find_or_create_by!(entry: @entry, tag: tag)

          # Propagate tag to feed level for auto-application
          FeedTagPropagator.propagate(user_entry: @user_entry, tag: tag)
        end

        render_tags
      end

      # DELETE /api/v1/entries/:entry_id/tags/:id
      # :id is the tag name (URL-encoded)
      def destroy
        tag_name = params[:id].to_s.strip.downcase
        tag = current_user.tags.find_by(name: tag_name)

        if tag
          EntryTag.where(entry: @entry, tag: tag).destroy_all
        end

        render_tags
      end

      private

      def set_entry
        @user_entry = current_user.user_entries.find(params[:entry_id])
        @entry = @user_entry.entry
      end

      def render_tags
        # Get tags for this entry that belong to the current user
        tags = @entry.tags.where(user_id: current_user.id).order(:name)
        render json: {
          entry_id: params[:entry_id].to_i,
          tags: tags.map { |t| { id: t.id, name: t.name, fg_color: t.fg_color, bg_color: t.bg_color } }
        }
      end
    end
  end
end
