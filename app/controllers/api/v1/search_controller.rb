module Api
  module V1
    class SearchController < BaseController
      # GET /api/v1/search?q=query
      def index
        return render_empty_results if params[:q].blank?

        @user_entries = search_user_entries
        @user_entries = filter_by_feed(@user_entries) if params[:feed_id].present?
        @user_entries = filter_by_category(@user_entries) if params[:category_id].present?

        # Pagination
        page = (params[:page] || 1).to_i
        per_page = [(params[:per_page] || 50).to_i, 100].min
        offset = (page - 1) * per_page

        total = @user_entries.count
        @user_entries = @user_entries.offset(offset).limit(per_page)

        render json: {
          query: params[:q],
          entries: @user_entries.map { |ue| search_result_json(ue) },
          pagination: {
            page: page,
            per_page: per_page,
            total: total,
            total_pages: (total.to_f / per_page).ceil
          }
        }
      end

      private

      def search_user_entries
        entry_ids = Entry.search(params[:q]).pluck(:id)

        current_user.user_entries
          .where(entry_id: entry_ids)
          .includes(:entry, :feed)
          .joins(:entry)
          .order("entries.date_entered DESC")
      end

      def filter_by_feed(scope)
        scope.where(feed_id: params[:feed_id])
      end

      def filter_by_category(scope)
        scope.joins(:feed).where(feeds: { category_id: params[:category_id] })
      end

      def render_empty_results
        render json: {
          query: "",
          entries: [],
          pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 }
        }
      end

      def search_result_json(user_entry)
        entry = user_entry.entry
        feed = user_entry.feed

        {
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
          # Include snippet with highlighted matches
          snippet: generate_snippet(entry, params[:q])
        }
      end

      def generate_snippet(entry, query)
        # Strip HTML and get plain text
        plain_content = ActionController::Base.helpers.strip_tags(entry.content.to_s)

        # Find the first occurrence of any query word
        words = query.to_s.split(/\s+/).reject(&:blank?)
        return plain_content.truncate(200) if words.empty?

        pattern = Regexp.new("(" + words.map { |w| Regexp.escape(w) }.join("|") + ")", Regexp::IGNORECASE)

        # Find position of first match
        match_pos = plain_content =~ pattern
        if match_pos
          # Extract context around the match
          start_pos = [match_pos - 80, 0].max
          excerpt = plain_content[start_pos, 200]
          excerpt = "..." + excerpt if start_pos > 0
          excerpt = excerpt + "..." if start_pos + 200 < plain_content.length
          excerpt
        else
          plain_content.truncate(200)
        end
      end
    end
  end
end
