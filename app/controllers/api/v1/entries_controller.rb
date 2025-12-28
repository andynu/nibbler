module Api
  module V1
    class EntriesController < BaseController
      before_action :set_user_entry, only: [ :show, :update, :toggle_read, :toggle_starred ]

      # GET /api/v1/entries
      def index
        @user_entries = current_user.user_entries
          .includes(:entry, :feed)
          .joins(:entry)

        # Apply ordering
        case params[:order_by]
        when "score"
          @user_entries = @user_entries.order("user_entries.score DESC, entries.date_entered DESC")
        else
          @user_entries = @user_entries.order("entries.date_entered DESC")
        end

        # Filter by read/unread status
        if params[:unread].present?
          @user_entries = params[:unread] == "true" ? @user_entries.unread : @user_entries.read
        end

        # Filter by starred
        if params[:starred].present? && params[:starred] == "true"
          @user_entries = @user_entries.starred
        end

        # Filter by published
        if params[:published].present? && params[:published] == "true"
          @user_entries = @user_entries.published
        end

        # Virtual feeds
        case params[:view]
        when "fresh"
          cutoff = fresh_article_cutoff_for_param(params[:fresh_max_age])
          # Use entries.updated (publication date) for Fresh view filtering, not date_entered (import time)
          @user_entries = @user_entries.where("entries.updated > ?", cutoff) if cutoff
          if params[:fresh_per_feed].present? && params[:fresh_per_feed].to_i > 0
            @user_entries = limit_per_feed(@user_entries, params[:fresh_per_feed].to_i)
          end
        when "starred"
          @user_entries = @user_entries.starred
        when "published"
          @user_entries = @user_entries.published
        when "archived"
          @user_entries = @user_entries.read
        end

        # Filter by feed
        if params[:feed_id].present?
          @user_entries = @user_entries.where(feed_id: params[:feed_id])
        end

        # Filter by category (including all descendant categories)
        if params[:category_id].present?
          category = current_user.categories.find_by(id: params[:category_id])
          if category
            category_ids = category.self_and_descendant_ids
            @user_entries = @user_entries.joins(:feed).where(feeds: { category_id: category_ids })
          end
        end

        # Filter by tag
        if params[:tag].present?
          tag = params[:tag].downcase.strip
          # Use tag_cache which stores comma-separated tags
          # Match: exact tag, tag at start (tag,), tag in middle (,tag,), or tag at end (,tag)
          @user_entries = @user_entries.where(
            "user_entries.tag_cache = :tag OR " \
            "user_entries.tag_cache LIKE :start OR " \
            "user_entries.tag_cache LIKE :middle OR " \
            "user_entries.tag_cache LIKE :ending",
            tag: tag, start: "#{tag},%", middle: "%,#{tag},%", ending: "%,#{tag}"
          )
        end

        # Pagination
        page = (params[:page] || 1).to_i
        per_page = [ (params[:per_page] || 50).to_i, 100 ].min
        offset = (page - 1) * per_page

        total = @user_entries.count
        @user_entries = @user_entries.offset(offset).limit(per_page)

        render json: {
          entries: @user_entries.map { |ue| user_entry_json(ue) },
          pagination: {
            page: page,
            per_page: per_page,
            total: total,
            total_pages: (total.to_f / per_page).ceil
          }
        }
      end

      # GET /api/v1/entries/:id
      def show
        render json: user_entry_json(@user_entry, full_content: true)
      end

      # PATCH /api/v1/entries/:id
      def update
        if @user_entry.update(user_entry_params)
          render json: user_entry_json(@user_entry)
        else
          render json: { errors: @user_entry.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # POST /api/v1/entries/:id/toggle_read
      def toggle_read
        @user_entry.update!(unread: !@user_entry.unread)
        render json: { id: @user_entry.id, unread: @user_entry.unread }
      end

      # POST /api/v1/entries/:id/toggle_starred
      def toggle_starred
        @user_entry.update!(marked: !@user_entry.marked)
        render json: { id: @user_entry.id, starred: @user_entry.marked }
      end

      # POST /api/v1/entries/mark_all_read
      def mark_all_read
        scope = current_user.user_entries.unread

        if params[:feed_id].present?
          scope = scope.where(feed_id: params[:feed_id])
        elsif params[:category_id].present?
          category = current_user.categories.find_by(id: params[:category_id])
          if category
            category_ids = category.self_and_descendant_ids
            scope = scope.joins(:feed).where(feeds: { category_id: category_ids })
          end
        end

        count = scope.update_all(unread: false, last_read: Time.current)
        render json: { marked_read: count }
      end

      # GET /api/v1/entries/headlines
      # Lightweight list without content for performance
      def headlines
        @user_entries = current_user.user_entries
          .joins(:entry, :feed)
          .select(
            "user_entries.id, user_entries.feed_id, user_entries.unread, user_entries.marked, user_entries.score",
            "entries.id as entry_id, entries.title, entries.link, entries.author, entries.updated, entries.date_entered",
            "feeds.title as feed_title"
          )

        # Apply ordering
        case params[:order_by]
        when "score"
          @user_entries = @user_entries.order("user_entries.score DESC, entries.date_entered DESC")
        else
          @user_entries = @user_entries.order("entries.date_entered DESC")
        end

        # Apply same filters as index
        @user_entries = @user_entries.where(unread: params[:unread] == "true") if params[:unread].present?
        @user_entries = @user_entries.where(marked: true) if params[:starred] == "true"
        @user_entries = @user_entries.where(published: true) if params[:published] == "true"
        @user_entries = @user_entries.where(feed_id: params[:feed_id]) if params[:feed_id].present?
        if params[:category_id].present?
          category = current_user.categories.find_by(id: params[:category_id])
          if category
            category_ids = category.self_and_descendant_ids
            @user_entries = @user_entries.where(feeds: { category_id: category_ids })
          end
        end

        case params[:view]
        when "fresh"
          # Use entries.updated (publication date) for Fresh view filtering
          @user_entries = @user_entries.where("entries.updated > ?", fresh_article_cutoff)
        when "starred"
          @user_entries = @user_entries.where(marked: true)
        when "published"
          @user_entries = @user_entries.where(published: true)
        when "archived"
          @user_entries = @user_entries.where(unread: false)
        end

        # Pagination
        page = (params[:page] || 1).to_i
        per_page = [ (params[:per_page] || 100).to_i, 500 ].min
        offset = (page - 1) * per_page

        total = @user_entries.count
        @user_entries = @user_entries.offset(offset).limit(per_page)

        render json: {
          headlines: @user_entries.map { |ue| headline_json(ue) },
          pagination: {
            page: page,
            per_page: per_page,
            total: total,
            total_pages: (total.to_f / per_page).ceil
          }
        }
      end

      private

      def set_user_entry
        @user_entry = current_user.user_entries.find(params[:id])
      end

      def user_entry_params
        params.require(:entry).permit(:unread, :marked, :score, :note)
      end

      def user_entry_json(user_entry, full_content: false)
        entry = user_entry.entry
        feed = user_entry.feed
        json = {
          id: user_entry.id,
          entry_id: entry.id,
          feed_id: feed&.id,
          feed_title: feed&.title,
          title: entry.title,
          link: entry.link,
          author: entry.author,
          published: entry.updated,
          unread: user_entry.unread,
          starred: user_entry.marked,
          score: user_entry.score,
          last_read: user_entry.last_read,
          content_preview: content_preview(entry.content)
        }

        if full_content
          # Use cached_content (with locally cached images) if available
          json[:content] = entry.cached_content.presence || entry.content
          json[:note] = user_entry.note
          json[:labels] = entry.labels.map { |l| { id: l.id, caption: l.caption, fg_color: l.fg_color, bg_color: l.bg_color } }
          json[:tags] = user_entry.tags.pluck(:tag_name)
          json[:enclosures] = entry.enclosures.map { |e| enclosure_json(e) }
        end

        json
      end

      def content_preview(content)
        return nil if content.blank?
        # Strip HTML tags and truncate to ~150 chars
        text = ActionController::Base.helpers.strip_tags(content).squish
        text.truncate(150)
      end

      # Lightweight JSON for headlines (uses select columns)
      def headline_json(ue)
        {
          id: ue.id,
          entry_id: ue.entry_id,
          feed_id: ue.feed_id,
          feed_title: ue.feed_title,
          title: ue.title,
          link: ue.link,
          author: ue.author,
          published: ue.updated,
          unread: ue.unread,
          starred: ue.marked,
          score: ue.score
        }
      end

      # Get the cutoff time for "fresh" articles based on user preference
      def fresh_article_cutoff
        pref = current_user.user_preferences.find_by(pref_name: "fresh_article_max_age")
        hours = pref&.value&.to_i || 24
        hours.hours.ago
      end

      # Get the cutoff time for "fresh" articles based on optional param or user preference
      def fresh_article_cutoff_for_param(max_age_param)
        case max_age_param
        when "week"
          1.week.ago
        when "month"
          1.month.ago
        when "all"
          nil # No time filter
        else
          # Default to user preference
          fresh_article_cutoff
        end
      end

      # Limit results to N per feed using window functions
      def limit_per_feed(user_entries, limit)
        # Extract just the IDs from the base query with correct SQL
        # We need to rebuild the query to use proper window functions
        base_ids = user_entries.reorder("").pluck(:id)
        return user_entries if base_ids.empty?

        # Use window function to rank entries per feed
        limited_ids_sql = <<~SQL
          SELECT id FROM (
            SELECT user_entries.id,
                   ROW_NUMBER() OVER (PARTITION BY user_entries.feed_id ORDER BY entries.date_entered DESC) as rn
            FROM user_entries
            INNER JOIN entries ON entries.id = user_entries.entry_id
            WHERE user_entries.id IN (#{base_ids.join(",")})
          ) ranked
          WHERE rn <= #{limit.to_i}
        SQL

        ids = ActiveRecord::Base.connection.select_values(limited_ids_sql)
        current_user.user_entries.where(id: ids).includes(:entry, :feed).joins(:entry).order("entries.date_entered DESC")
      end

      def enclosure_json(enclosure)
        {
          id: enclosure.id,
          content_url: enclosure.content_url,
          content_type: enclosure.content_type,
          title: enclosure.title,
          duration: enclosure.duration,
          width: enclosure.width,
          height: enclosure.height
        }
      end
    end
  end
end
