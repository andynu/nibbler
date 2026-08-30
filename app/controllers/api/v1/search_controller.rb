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
        snippets = snippets_for(@user_entries)

        render json: {
          query: params[:q],
          entries: @user_entries.map { |ue| search_result_json(ue, snippets) },
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

      # One extra query for the page's excerpts, keyed by entry id.
      #
      # ts_headline is deliberately not a column of the search query itself. It
      # re-parses the whole document for every row it is evaluated on, and in a
      # query that sorts by rank the target list is computed below the sort, so
      # riding along there would headline every match in the result set to show
      # the fifty that survive the limit. Here the rows are already chosen.
      def snippets_for(user_entries)
        entry_ids = user_entries.map(&:entry_id).uniq
        return {} if entry_ids.empty?

        Entry.where(id: entry_ids)
             .pluck(:id, Arel.sql(Entry.text_search_headline(params[:q])))
             .to_h
      end

      def search_result_json(user_entry, snippets)
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
          # The excerpt, with the matched lexemes wrapped in Entry's delimiters
          # for the client to turn into <mark> elements.
          snippet: snippets[entry.id]
        }
      end
    end
  end
end
