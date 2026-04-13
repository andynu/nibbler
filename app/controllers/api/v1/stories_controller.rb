module Api
  module V1
    # Stories API: user-tracked news stories seeded from feed entries.
    #
    # Exposes list/show/update/destroy for stories, plus the
    # `extract_from_entry` action that runs the LLM-based query extractor
    # to propose a topic and queries the user can confirm before creating.
    #
    # @see Story
    # @see StoryQueryExtractor
    class StoriesController < BaseController
      before_action :set_story, only: [ :show, :update, :destroy, :wrapup ]

      # GET /api/v1/stories
      def index
        stories = current_user.stories
          .includes(:story_analyses)
          .order(created_at: :desc)
        render json: stories.map { |s| story_json(s, include_latest_analysis: true) }
      end

      # GET /api/v1/stories/:id
      # Returns the story plus its full timeline (analyses ordered by created_at
      # ascending) and its collected articles. Includes enough for the detail UI
      # to render without additional requests.
      def show
        analyses = @story.story_analyses.order(created_at: :asc)
        articles = @story.story_articles.order(Arel.sql("COALESCE(published_at, fetched_at) DESC"))

        render json: story_json(@story).merge(
          analyses: analyses.map { |a| analysis_json(a) },
          articles: articles.map { |a| article_json(a) }
        )
      end

      # POST /api/v1/stories/extract_from_entry
      # Runs the LLM query extractor on a user-owned entry and returns a
      # proposed topic + queries. Does NOT create a Story; the client is
      # expected to present a confirmation dialog and POST /stories to save.
      #
      # Params:
      #   entry_id [Integer] the UserEntry id (same id the reader uses)
      #
      # Returns:
      #   { topic: String, queries: [String], source_entry_id: Integer }
      def extract_from_entry
        user_entry = current_user.user_entries.find_by(id: params[:entry_id])
        return render json: { error: "Entry not found" }, status: :not_found unless user_entry

        begin
          result = extractor.extract(user_entry.entry)
        rescue LlmClient::Unreachable => e
          return render json: { error: "LLM unreachable: #{e.message}" }, status: :service_unavailable
        rescue StoryQueryExtractor::ExtractionFailed => e
          return render json: { error: "Extraction failed: #{e.message}" }, status: :unprocessable_entity
        end

        render json: {
          topic: result[:topic],
          queries: result[:queries],
          source_entry_id: user_entry.entry_id
        }
      end

      # POST /api/v1/stories
      # Creates a story owned by the current user. Typically called after
      # the user confirms/edits the result of extract_from_entry.
      #
      # Params (under :story):
      #   name [String] required
      #   queries [Array<String>] required, at least one
      #   source_entry_id [Integer] optional, the Entry.id this story came from
      def create
        attrs = story_create_params
        story = current_user.stories.build(
          name: attrs[:name],
          queries: Array(attrs[:queries]).map(&:to_s).map(&:strip).reject(&:empty?),
          source_entry_id: attrs[:source_entry_id],
          status: "active"
        )

        if story.queries.empty?
          return render json: { errors: [ "Queries can't be blank" ] }, status: :unprocessable_entity
        end

        if story.save
          # Kick off the initial article fetch immediately so the user sees
          # articles without waiting for the overnight scheduler (FetchStoriesJob).
          FetchStoryArticlesJob.perform_later(story.id)
          render json: story_json(story), status: :created
        else
          render json: { errors: story.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/stories/:id
      def update
        attrs = story_update_params
        if attrs.key?(:queries)
          attrs[:queries] = Array(attrs[:queries]).map(&:to_s).map(&:strip).reject(&:empty?)
        end

        if @story.update(attrs)
          render json: story_json(@story)
        else
          render json: { errors: @story.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/stories/:id
      def destroy
        @story.destroy
        head :no_content
      end

      # POST /api/v1/stories/:id/wrapup
      # Generates a narrative markdown summary of the story's full arc and
      # persists it to story.wrapup. Intended for stories the user has
      # marked (or analyze auto-marked) as concluded, but we allow active
      # stories too — e.g. if the user wants a mid-story recap.
      #
      # Runs synchronously: wrapup prompts can take tens of seconds against a
      # local Ollama, which is acceptable for a user-initiated button click
      # (matches the existing pattern of extract_from_entry).
      #
      # Returns:
      #   { wrapup: String, wrapup_generated_at: ISO8601 }
      def wrapup
        begin
          narrative = wrapup_generator.generate(@story)
        rescue LlmClient::Unreachable => e
          return render json: { error: "LLM unreachable: #{e.message}" }, status: :service_unavailable
        rescue StoryWrapupGenerator::WrapupFailed => e
          return render json: { error: "Wrapup failed: #{e.message}" }, status: :unprocessable_entity
        end

        @story.update!(
          wrapup: narrative,
          wrapup_generated_at: Time.current
        )

        render json: {
          wrapup: @story.wrapup,
          wrapup_generated_at: @story.wrapup_generated_at
        }
      end

      private

      def wrapup_generator
        @wrapup_generator ||= StoryWrapupGenerator.new
      end

      def set_story
        @story = current_user.stories.find_by(id: params[:id])
        render json: { error: "Story not found" }, status: :not_found unless @story
      end

      def extractor
        @extractor ||= StoryQueryExtractor.new
      end

      def story_create_params
        params.require(:story).permit(:name, :source_entry_id, queries: [])
      end

      def story_update_params
        params.require(:story).permit(:name, :status, queries: []).to_h.symbolize_keys
      end

      def story_json(story, include_latest_analysis: false)
        base = {
          id: story.id,
          name: story.name,
          queries: story.queries,
          summary: story.summary,
          status: story.status,
          source_entry_id: story.source_entry_id,
          concluded_at: story.concluded_at,
          wrapup: story.wrapup,
          wrapup_generated_at: story.wrapup_generated_at,
          created_at: story.created_at
        }

        if include_latest_analysis
          latest = story.story_analyses.max_by(&:created_at)
          base[:latest_analysis] = latest && {
            timeline_label: latest.timeline_label,
            new_development: latest.new_development,
            created_at: latest.created_at
          }
          base[:updated_at] = latest&.created_at || story.created_at
        end

        base
      end

      def analysis_json(analysis)
        {
          id: analysis.id,
          new_development: analysis.new_development,
          concluded: analysis.concluded,
          timeline_label: analysis.timeline_label,
          summary: analysis.summary,
          rationale: analysis.rationale,
          article_ids: parse_article_ids(analysis.article_ids),
          created_at: analysis.created_at
        }
      end

      def article_json(article)
        {
          id: article.id,
          url: article.url,
          title: article.title,
          snippet: article.snippet,
          source: article.source,
          published_at: article.published_at,
          fetched_at: article.fetched_at
        }
      end

      # article_ids is jsonb in Postgres but may be stored as a JSON string in
      # some environments (notably fixtures). Normalize to a plain array.
      def parse_article_ids(value)
        case value
        when Array then value
        when String
          begin
            parsed = JSON.parse(value)
            parsed.is_a?(Array) ? parsed : []
          rescue JSON::ParserError
            []
          end
        else []
        end
      end
    end
  end
end
