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

      # Everything PATCH will store. This list must cover every field of the
      # Preferences interface in app/javascript/lib/api.ts; a key the client
      # writes but this list omits is accepted with a 200 and thrown away.
      def allowed_preference_keys
        %w[
          show_content_preview
          strip_images
          content_view_mode
          default_update_interval
          confirm_feed_catchup
          default_view_mode
          default_view_limit
          fresh_article_max_age
          date_format
          hide_read_feeds
          hide_read_shows_special
          feeds_sort_by_unread
          entries_sort_by_score
          entries_sort_config
          entries_hide_read
          entries_hide_unstarred
          entries_display_density
          purge_old_days
          purge_unread_articles
          theme
          accent_hue
          sidebar_collapsed
          sync_to_tree
          user_language
          tts_playback_speed
          digest_enable
          digest_preferred_time
          digest_catchup
          digest_min_score
        ]
      end

      # Values GET reports for a user who has stored nothing.
      #
      # entries_sort_config is intentionally absent. The reader resolves its
      # sort as `entries_sort_config || (entries_sort_by_score == "true" ?
      # "score:desc" : "date:desc")`, so a default here would always win and
      # would silently ignore entries_sort_by_score for the users who still
      # have only that older preference stored. Leaving the key out keeps the
      # legacy fallback reachable; the key is writable, so once a reader picks
      # a sort it is stored and returned from then on.
      def default_preferences
        {
          "show_content_preview" => "true",
          "strip_images" => "false",
          "content_view_mode" => "rss",
          "default_update_interval" => "30",
          "confirm_feed_catchup" => "true",
          "default_view_mode" => "adaptive",
          "default_view_limit" => "30",
          "fresh_article_max_age" => "24",
          "date_format" => "relative",
          "hide_read_feeds" => "false",
          "hide_read_shows_special" => "true",
          "feeds_sort_by_unread" => "false",
          "entries_sort_by_score" => "false",
          "entries_hide_read" => "false",
          "entries_hide_unstarred" => "false",
          "entries_display_density" => "medium",
          "purge_old_days" => "60",
          "purge_unread_articles" => "false",
          "theme" => "system",
          "accent_hue" => "210",
          "sidebar_collapsed" => "false",
          "sync_to_tree" => "false",
          "user_language" => "",
          "tts_playback_speed" => "1",
          "digest_enable" => "false",
          # SendDigestsJob assumes 08:00 when no row exists; DigestMailer
          # assumes a minimum score of 0. Keep these two in step with it.
          "digest_preferred_time" => "08:00",
          "digest_catchup" => "false",
          "digest_min_score" => "0"
        }
      end
    end
  end
end
