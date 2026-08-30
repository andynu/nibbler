module Api
  module V1
    class SearchController < BaseController
      include EntryScoping

      # GET /api/v1/search?q=query
      def index
        return render_empty_results if params[:q].blank?

        # The same scoping vocabulary the entry list reads, applied to the same
        # shape of relation, so a search is the intersection of the query and
        # the list the user is looking at rather than a second opinion about
        # what that list contains.
        #
        # The Fresh per-feed cap inside apply_entry_scoping still ranks by
        # publication date, not by relevance: the cap decides which rows Fresh
        # holds at all, and only then does the query rank what is left. Letting
        # relevance choose the surviving 5 would make search invent rows the
        # Fresh list beside it does not have.
        @user_entries = apply_entry_scoping(search_user_entries)

        # Pagination
        page = (params[:page] || 1).to_i
        per_page = [ (params[:per_page] || 50).to_i, 100 ].min
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

      # One pass: PostgreSQL filters and ranks the user's own rows. The earlier
      # form ran Entry.search over the whole shared entries table, plucked every
      # matching id into Ruby, and sent it back as an IN list, which also
      # discarded the ts_rank ordering the scope had just paid for.
      #
      # Results come back by relevance, not by date. Search is the one place in
      # the app where the user has said what they are looking for, so the best
      # match belongs at the top; date_entered DESC is the right default for the
      # entry list, where the question is "what is new", and it stays the
      # tiebreak here. The final user_entries.id keeps paging deterministic when
      # two rows tie on both.
      def search_user_entries
        current_user.user_entries
          .joins(:entry)
          .includes(:entry, :feed)
          .where(Arel.sql(Entry.text_search_condition(params[:q])))
          .order(Arel.sql("#{Entry.text_search_rank(params[:q])} DESC"))
          .order("entries.date_entered DESC", "user_entries.id DESC")
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
          start_pos = [ match_pos - 80, 0 ].max
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
