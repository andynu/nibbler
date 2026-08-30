module Api
  module V1
    class SearchController < BaseController
      include EntryScoping
      include EntrySorting

      # The one column search has that the entry list cannot offer: an article
      # is only relevant to something once there is a query to be relevant to.
      RELEVANCE = "relevance".freeze

      # The rest of the vocabulary, spelled exactly as
      # EntriesController::SORT_COLUMN_MAP spells it so one control on the
      # client can drive both endpoints.
      #
      # "score" and "unread" are deliberately missing. A search result carries
      # neither -- see #search_result_json -- so ordering by them would rearrange
      # the list around a value the reader cannot see. They fall through to the
      # relevance default rather than erroring, which is what a stale sort
      # carried over from the entry list needs to do.
      SORT_COLUMN_MAP = {
        "date" => "entries.date_entered",
        "feed" => "feeds.title",
        "title" => "entries.title"
      }.freeze

      # Relevance first, because search is the one place in the app where the
      # reader has said what they are looking for.
      DEFAULT_SORT = [ { column: RELEVANCE, direction: "desc" } ].freeze

      # GET /api/v1/search?q=query
      def index
        return render_empty_results if params[:q].blank?
        return render_nothing_to_search_for if Entry.excludes_only?(params[:q])

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
      def search_user_entries
        scope = current_user.user_entries
          .joins(:entry)
          .includes(:entry, :feed)
          .where(Arel.sql(Entry.text_search_condition(params[:q])))
        scope = scope.joins(:feed) if sort_specs.any? { |spec| spec[:column] == "feed" }
        scope.order(Arel.sql(order_clauses.join(", ")))
      end

      # What the reader asked for, then the two clauses that are not theirs to
      # drop.
      #
      # date_entered DESC has always been the tiebreak here and stays one: with
      # the primary sort equal, the newer article is the one wanted first. It is
      # skipped when the reader is already sorting by that column, where a
      # second clause on it would only contradict the direction they chose.
      #
      # The primary key goes last unconditionally. Two rows equal on every
      # clause above it would otherwise come back in whatever order the plan
      # produced, and LIMIT/OFFSET over an unstable order can hand page 2 a row
      # page 1 already showed.
      def order_clauses
        clauses = sort_specs.map { |spec| "#{sort_sql(spec[:column])} #{spec[:direction].upcase}" }
        clauses << "entries.date_entered DESC" unless sort_specs.any? { |spec| spec[:column] == "date" }
        clauses << "user_entries.id DESC"
      end

      def sort_sql(column)
        column == RELEVANCE ? Entry.text_search_rank(params[:q]) : SORT_COLUMN_MAP.fetch(column)
      end

      def sort_specs
        @sort_specs ||= parse_sort_param(params[:sort])
      end

      # The same "column:direction,column:direction" grammar the entry list
      # reads, from EntrySorting. Only the vocabulary below is search's own:
      # the column name is kept rather than resolved, because relevance has no
      # fixed SQL to resolve to -- #sort_sql builds it from the query -- and
      # #order_clauses still has to recognise "date" and "feed" by name.
      def parse_sort_param(sort_string)
        parse_sort_clauses(sort_string, default: DEFAULT_SORT) do |column|
          column if column == RELEVANCE || SORT_COLUMN_MAP.key?(column)
        end
      end

      def render_empty_results
        render json: {
          query: "",
          entries: [],
          pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 }
        }
      end

      # An answer rather than a run. "-wombat" alone is a valid tsquery that
      # matches almost every row in the shared entries table, and one the GIN
      # index cannot serve, so the honest response is to say what is missing
      # from the query. The client renders this string, so it names the fix.
      def render_nothing_to_search_for
        render json: {
          error: 'Add a word to search for. "-term" on its own only says what to leave out.'
        }, status: :unprocessable_entity
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
