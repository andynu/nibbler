module Api
  module V1
    class PreferencesController < BaseController
      # GET /api/v1/preferences
      def index
        preferences = current_user.user_preferences.pluck(:pref_name, :value).to_h
        render json: default_preferences.merge(preferences)
      end

      # PATCH /api/v1/preferences
      def update
        params.permit(*allowed_preference_keys).each do |key, value|
          pref = current_user.user_preferences.find_or_initialize_by(pref_name: key)
          pref.value = value.to_s
          pref.save!
        end

        preferences = current_user.user_preferences.pluck(:pref_name, :value).to_h
        render json: default_preferences.merge(preferences)
      end

      private

      def allowed_preference_keys
        %w[
          show_content_preview
          strip_images
          default_update_interval
          confirm_feed_catchup
          default_view_mode
          default_view_limit
          fresh_article_max_age
          date_format
        ]
      end

      def default_preferences
        {
          "show_content_preview" => "true",
          "strip_images" => "false",
          "default_update_interval" => "30",
          "confirm_feed_catchup" => "true",
          "default_view_mode" => "adaptive",
          "default_view_limit" => "30",
          "fresh_article_max_age" => "24",
          "date_format" => "relative"
        }
      end
    end
  end
end
