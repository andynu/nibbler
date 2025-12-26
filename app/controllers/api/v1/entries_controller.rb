module Api
  module V1
    class EntriesController < BaseController
      before_action :set_user_entry, only: [:show, :update, :toggle_read, :toggle_starred]

      # GET /api/v1/entries
      def index
        @user_entries = current_user.user_entries
          .includes(:entry, :feed)
          .joins(:entry)
          .order("entries.date_entered DESC")

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
          @user_entries = @user_entries.where("entries.date_entered > ?", 24.hours.ago)
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

        # Filter by category
        if params[:category_id].present?
          @user_entries = @user_entries.joins(:feed).where(feeds: { category_id: params[:category_id] })
        end

        # Pagination
        page = (params[:page] || 1).to_i
        per_page = [(params[:per_page] || 50).to_i, 100].min
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
          scope = scope.joins(:feed).where(feeds: { category_id: params[:category_id] })
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
            "entries.id as entry_id, entries.title, entries.link, entries.author, entries.updated",
            "feeds.title as feed_title"
          )
          .order("entries.date_entered DESC")

        # Apply same filters as index
        @user_entries = @user_entries.where(unread: params[:unread] == "true") if params[:unread].present?
        @user_entries = @user_entries.where(marked: true) if params[:starred] == "true"
        @user_entries = @user_entries.where(published: true) if params[:published] == "true"
        @user_entries = @user_entries.where(feed_id: params[:feed_id]) if params[:feed_id].present?
        @user_entries = @user_entries.where(feeds: { category_id: params[:category_id] }) if params[:category_id].present?

        case params[:view]
        when "fresh"
          @user_entries = @user_entries.where("entries.date_entered > ?", 24.hours.ago)
        when "starred"
          @user_entries = @user_entries.where(marked: true)
        when "published"
          @user_entries = @user_entries.where(published: true)
        when "archived"
          @user_entries = @user_entries.where(unread: false)
        end

        # Pagination
        page = (params[:page] || 1).to_i
        per_page = [(params[:per_page] || 100).to_i, 500].min
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
          last_read: user_entry.last_read
        }

        if full_content
          json[:content] = entry.content
          json[:note] = user_entry.note
          json[:labels] = entry.labels.map { |l| { id: l.id, caption: l.caption, fg_color: l.fg_color, bg_color: l.bg_color } }
          json[:tags] = user_entry.tags.pluck(:tag_name)
        end

        json
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
    end
  end
end
