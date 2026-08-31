module Api
  module V1
    class EntriesController < BaseController
      include EntryScoping
      include EntrySorting

      before_action :set_user_entry, only: [ :show, :update, :toggle_read, :toggle_starred, :toggle_published, :audio, :summarize, :info, :embed_policy ]

      # GET /api/v1/entries
      def index
        @user_entries = current_user.user_entries
          .includes(:feed, entry: :tags)
          .joins(:entry)

        # Join feeds table if sorting by feed
        if sort_requires_feeds_join?
          @user_entries = @user_entries.joins(:feed)
        end

        # Apply ordering
        @user_entries = apply_sorting(@user_entries)

        # Scoping params, read through EntryScoping so a search narrowed to this
        # list applies exactly the same filters.
        @user_entries = apply_entry_scoping(@user_entries)

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

      # POST /api/v1/entries/:id/toggle_published
      def toggle_published
        @user_entry.toggle_published!
        render json: { id: @user_entry.id, is_published: @user_entry.published }
      end

      # GET /api/v1/entries/:id/audio
      # Returns audio URL and word-level timestamps for TTS playback.
      # If audio doesn't exist, starts generation and returns status.
      def audio
        entry = @user_entry.entry
        cached = entry.cached_audio
        playable = cached&.valid_for_content?(entry.content) && File.exist?(cached.cached_path)

        # Already-generated audio still plays where TTS itself cannot run, so
        # only the generation paths below are gated.
        if !playable && !TtsGenerator.available?
          render json: { status: "unavailable", error: TtsGenerator::UNAVAILABLE_ERROR }
          return
        end

        # Check if we have valid cached audio
        if playable
          render json: {
            status: "ready",
            audio_url: cached.audio_url,
            duration: cached.duration,
            timestamps: cached.timestamps
          }
          return
        end

        # Clean up stale cache
        cached&.destroy

        # Check for recent jobs (pending or failed) for this entry
        recent_jobs = GoodJob::Job.where(job_class: "GenerateArticleAudioJob")
          .where("serialized_params->>'arguments' LIKE ?", "%#{entry.id}%")
          .where("created_at > ?", 1.hour.ago)
          .order(created_at: :desc)

        pending_job = recent_jobs.find { |j| j.finished_at.nil? }
        if pending_job
          render json: { status: "generating" }
          return
        end

        # Check for recently failed job (has error within last hour)
        failed_job = recent_jobs.find { |j| j.error.present? }
        if failed_job
          render json: { status: "error", error: failed_job.error.to_s.truncate(200) }
          return
        end

        # Start generation
        GenerateArticleAudioJob.perform_later(entry.id)
        render json: { status: "generating" }
      end

      # POST /api/v1/entries/:id/summarize
      #
      # Asks for a one-paragraph triage summary and answers with the state the
      # reader is now in. It never waits on the model: generation takes tens of
      # seconds on a local Ollama, so the result arrives over
      # EntrySummaryChannel, which the client is already subscribed to.
      #
      # POST rather than GET because it spends model throughput. Reaching this
      # action is always a deliberate press: a summary that already exists is
      # sent with the article by #show, and a stale one is shown as stale rather
      # than regenerated on read, so nothing here fires from a render.
      def summarize
        entry = @user_entry.entry
        cached = entry.entry_summary

        if cached && !cached.stale?
          render json: { status: "ready", summary: EntrySummaryChannel.summary_payload(cached) }
          return
        end

        unless EntrySummarizer.summarizable?(entry)
          render json: {
            status: "too_short",
            message: SummarizeEntryJob::TOO_SHORT_MESSAGE,
            content_length: EntrySummarizer.article_text(entry).length
          }
          return
        end

        # perform_later returns false when GoodJob's concurrency control aborts
        # the enqueue because a generation for this entry is already queued or
        # running -- two clicks, or two readers on the same article. That is the
        # same answer either way: one generation is in flight and its result
        # reaches every subscriber, including this one.
        SummarizeEntryJob.perform_later(entry.id)
        render json: { status: "queued" }
      end

      # GET /api/v1/entries/:id/info
      # Returns word frequency analysis for a single entry (for tag suggestions)
      def info
        entry = @user_entry.entry
        analyzer = EntryWordFrequencyAnalyzer.new(entry)
        render json: { top_words: analyzer.analyze }
      end

      # GET /api/v1/entries/:id/embed_policy
      # Whether the entry's page will render inside the reader's iframe. The
      # browser cannot tell the embedder that a frame was refused, so the
      # question is answered here by reading the page's own headers; see
      # EmbedPolicyProbe. The URL comes from the entry rather than the request,
      # so this cannot be pointed at an arbitrary host.
      def embed_policy
        result = EmbedPolicyProbe.for(@user_entry.entry.link)
        render json: { status: result.status, reason: result.reason }
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

      # GET /api/v1/entries/keywords
      # Returns top keywords from entries for tag suggestions
      def keywords
        entries_scope = current_user.user_entries.joins(:entry)

        # Filter by feed
        if params[:feed_id].present?
          entries_scope = entries_scope.where(feed_id: params[:feed_id])
        end

        # Filter by category (including all descendant categories)
        if params[:category_id].present?
          category = current_user.categories.find_by(id: params[:category_id])
          if category
            category_ids = category.self_and_descendant_ids
            entries_scope = entries_scope.joins(:feed).where(feeds: { category_id: category_ids })
          end
        end

        # Limit to recent entries for performance (default 100)
        limit = [ (params[:entry_limit] || 100).to_i, 500 ].min
        entries = Entry.where(id: entries_scope.order("entries.date_entered DESC").limit(limit).pluck("entries.id"))

        # Get word count limit (default 10 for suggestions)
        word_limit = [ (params[:limit] || 10).to_i, 50 ].min

        keywords = WordFrequencyAnalyzer.for_entries(entries, limit: word_limit).analyze

        render json: { keywords: keywords }
      end

      # GET /api/v1/entries/headlines
      # Lightweight list without content for performance
      def headlines
        @user_entries = current_user.user_entries
          .joins(:entry, :feed)
          .select(
            "user_entries.id, user_entries.feed_id, user_entries.unread, user_entries.marked, user_entries.published, user_entries.score",
            "entries.id as entry_id, entries.title, entries.link, entries.author, entries.updated, entries.date_entered",
            "feeds.title as feed_title"
          )

        # Apply ordering (feeds already joined above)
        @user_entries = apply_sorting(@user_entries)

        # Same scoping as #index, read through EntryScoping. The concern only
        # adds WHERE clauses and association joins, so the select list above
        # survives: its joins(:feed) and joins(:entry) collapse into the ones
        # already declared rather than aliasing a second copy of the table.
        @user_entries = apply_entry_scoping(@user_entries)

        # Pagination
        page = (params[:page] || 1).to_i
        per_page = [ (params[:per_page] || 100).to_i, 500 ].min
        offset = (page - 1) * per_page

        # Name the column explicitly: a bare count on this relation would fold
        # the multi-column select into COUNT(...) and blow up as invalid SQL.
        total = @user_entries.count("user_entries.id")
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
        @user_entry = current_user.user_entries
          .includes(:feed, entry: [ :tags, :enclosures ])
          .find(params[:id])
      end

      def user_entry_params
        params.require(:entry).permit(:unread, :marked, :score, :note)
      end

      def user_entry_json(user_entry, full_content: false)
        entry = user_entry.entry
        feed = user_entry.feed
        user_tags = entry.tags.select { |t| t.user_id == user_entry.user_id }

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
          is_published: user_entry.published,
          score: user_entry.score,
          last_read: user_entry.last_read,
          content_preview: content_preview(entry.content),
          tags: user_tags.map { |t| { id: t.id, name: t.name, fg_color: t.fg_color, bg_color: t.bg_color } }
        }

        if full_content
          # Use cached_content (with locally cached images) if available
          json[:content] = entry.cached_content.presence || entry.content
          json[:note] = user_entry.note
          json[:detected_tags] = detect_tags_in_content(entry, user_entry.user_id)
          json[:enclosures] = entry.enclosures.map { |e| enclosure_json(e) }
          # A cached summary travels with the article so re-opening one shows it
          # without a request, and `stale` travels with it because the client
          # never sees a content_hash and so cannot work the answer out. Only on
          # the full-content path: the list does not render summaries, and
          # `summarizable` costs a pass over the whole body.
          json[:summary] = EntrySummaryChannel.summary_payload(entry.entry_summary)
          json[:summarizable] = EntrySummarizer.summarizable?(entry)
        end

        json
      end

      def content_preview(content)
        return nil if content.blank?

        # ArticleText, not strip_tags: the preview is the opening of the body,
        # which is where the block boundaries are densest, so a stripped-only
        # preview showed the reader words the article does not contain.
        ArticleText.from_html(content).truncate(150)
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
          is_published: ue.published,
          score: ue.score
        }
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

      # This endpoint's own sort vocabulary. "score" and "unread" are here and
      # not in SearchController's map because the entry list's JSON carries
      # both; "relevance" is there and not here for the same reason in reverse.
      SORT_COLUMN_MAP = {
        "date" => "entries.date_entered",
        "published" => "entries.updated",
        "feed" => "feeds.title",
        "title" => "entries.title",
        "score" => "user_entries.score",
        "unread" => "user_entries.unread"
      }.freeze

      # Newest import first, which is what the list has always opened on.
      DEFAULT_SORT = [ { column: "entries.date_entered", direction: "desc" } ].freeze

      # Parse sort parameter (e.g., "date:desc,feed:asc,score:desc")
      # Returns array of { column: "sql_column", direction: "asc"|"desc" }.
      #
      # The grammar lives in EntrySorting; the block below is the only part of
      # it this endpoint owns, and it resolves each name straight to SQL.
      def parse_sort_param(sort_string)
        parse_sort_clauses(sort_string, default: DEFAULT_SORT) { |column| SORT_COLUMN_MAP[column] }
      end

      # Apply sorting to query based on params
      # Supports both legacy order_by param and new sort param
      def apply_sorting(query)
        if params[:sort].present?
          sort_specs = parse_sort_param(params[:sort])
          order_clauses = sort_specs.map { |s| "#{s[:column]} #{s[:direction].upcase}" }
          query.order(Arel.sql(order_clauses.join(", ")))
        elsif params[:order_by] == "score"
          query.order("user_entries.score DESC, entries.date_entered DESC")
        else
          query.order("entries.date_entered DESC")
        end
      end

      # Check if sorting requires feeds table to be joined
      def sort_requires_feeds_join?
        return false unless params[:sort].present?

        params[:sort].downcase.include?("feed")
      end

      # Detect which of the user's tags appear in the entry content but aren't explicitly applied
      def detect_tags_in_content(entry, user_id)
        user_tags = Tag.where(user_id: user_id).pluck(:id, :name)
        applied_tag_ids = entry.tags.where(user_id: user_id).pluck(:id)
        content = "#{entry.title} #{ArticleText.from_html(entry.content)}".downcase

        user_tags.reject { |id, _| applied_tag_ids.include?(id) }
                 .select { |_, name| content.include?(name.downcase) }
                 .map { |id, name| { id: id, name: name } }
      end
    end
  end
end
