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
      before_action :set_story, only: [ :show, :update, :destroy ]

      # GET /api/v1/stories
      def index
        stories = current_user.stories.order(created_at: :desc)
        render json: stories.map { |s| story_json(s) }
      end

      # GET /api/v1/stories/:id
      def show
        render json: story_json(@story)
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

      private

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

      def story_json(story)
        {
          id: story.id,
          name: story.name,
          queries: story.queries,
          summary: story.summary,
          status: story.status,
          source_entry_id: story.source_entry_id,
          concluded_at: story.concluded_at,
          created_at: story.created_at
        }
      end
    end
  end
end
