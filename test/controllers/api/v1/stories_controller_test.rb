require "test_helper"
require "minitest/mock"

class Api::V1::StoriesControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  def setup
    # The test env uses ALLOW_DEV_AUTH=1 which authenticates as User.first.
    @user = User.first
    @other_user = User.where.not(id: @user.id).first
    @entry = entries(:basic)
    # Ensure the authenticated user has a UserEntry for the entry we'll extract from.
    @user_entry = @user.user_entries.where(entry: @entry).first ||
      @user.user_entries.create!(
        entry: @entry,
        feed: feeds(:high_frequency),
        uuid: SecureRandom.uuid,
        unread: true
      )
  end

  # =====================
  # GET /api/v1/stories
  # =====================

  test "index returns current user's stories" do
    story = @user.stories.create!(name: "Test Story", queries: [ "q1" ], status: "active")

    get api_v1_stories_url, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    names = json.map { |s| s["name"] }
    assert_includes names, "Test Story"
  end

  test "index does not include other users' stories" do
    @other_user.stories.create!(name: "Other's Story", queries: [ "q" ], status: "active")

    get api_v1_stories_url, as: :json
    json = JSON.parse(response.body)
    assert_not_includes json.map { |s| s["name"] }, "Other's Story"
  end

  # =====================
  # GET /api/v1/stories/:id
  # =====================

  test "show returns the story" do
    story = @user.stories.create!(name: "Show Me", queries: [ "q" ], status: "active")

    get api_v1_story_url(story), as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "Show Me", json["name"]
    assert_equal [ "q" ], json["queries"]
  end

  test "show returns analyses and articles for the detail view" do
    story = @user.stories.create!(name: "Detail", queries: [ "q" ], status: "active")
    a1 = story.story_analyses.create!(
      new_development: false, concluded: false, timeline_label: "no_change",
      summary: "Nothing new", rationale: "n/a", article_ids: [], created_at: 1.day.ago
    )
    a2 = story.story_analyses.create!(
      new_development: true, concluded: false, timeline_label: "new_development",
      summary: "Change!", rationale: "sources", article_ids: [ 1, 2 ], created_at: 1.hour.ago
    )
    story.story_articles.create!(url: "https://example.com/1", title: "One")

    get api_v1_story_url(story), as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_kind_of Array, json["analyses"]
    assert_kind_of Array, json["articles"]
    assert_equal [ "no_change", "new_development" ], json["analyses"].map { |a| a["timeline_label"] }
    assert_includes json["articles"].map { |a| a["url"] }, "https://example.com/1"
  end

  test "index includes latest_analysis summary for each story" do
    story = @user.stories.create!(name: "With Analyses", queries: [ "q" ], status: "active")
    story.story_analyses.create!(
      new_development: true, concluded: false, timeline_label: "new_development",
      summary: "s", rationale: "r", article_ids: [], created_at: 1.hour.ago
    )

    get api_v1_stories_url, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    entry = json.find { |s| s["name"] == "With Analyses" }
    assert_not_nil entry
    assert_not_nil entry["latest_analysis"]
    assert_equal "new_development", entry["latest_analysis"]["timeline_label"]
    assert_not_nil entry["updated_at"]
  end

  test "show returns 404 for other user's story" do
    other_story = @other_user.stories.create!(name: "Theirs", queries: [ "q" ], status: "active")

    get api_v1_story_url(other_story), as: :json
    assert_response :not_found
  end

  # ====================================
  # POST /api/v1/stories/extract_from_entry
  # ====================================

  test "extract_from_entry returns topic and queries from extractor" do
    stub_extractor(topic: "Crypto Regs", queries: [ "SEC crypto", "crypto enforcement" ]) do
      post extract_from_entry_api_v1_stories_url,
        params: { entry_id: @user_entry.id },
        as: :json
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "Crypto Regs", json["topic"]
    assert_equal [ "SEC crypto", "crypto enforcement" ], json["queries"]
    assert_equal @entry.id, json["source_entry_id"]
  end

  test "extract_from_entry returns 404 when user does not own the entry" do
    other_user_entry = @other_user.user_entries.create!(
      entry: @entry,
      feed: feeds(:high_frequency),
      uuid: SecureRandom.uuid,
      unread: true
    )

    post extract_from_entry_api_v1_stories_url,
      params: { entry_id: other_user_entry.id },
      as: :json

    assert_response :not_found
  end

  test "extract_from_entry returns 503 when LLM is unreachable" do
    stub_extractor(error: LlmClient::Unreachable.new("down")) do
      post extract_from_entry_api_v1_stories_url,
        params: { entry_id: @user_entry.id },
        as: :json
    end

    assert_response :service_unavailable
    json = JSON.parse(response.body)
    assert_match(/unreachable/i, json["error"])
  end

  test "extract_from_entry returns 422 when extraction fails" do
    stub_extractor(error: StoryQueryExtractor::ExtractionFailed.new("bad json")) do
      post extract_from_entry_api_v1_stories_url,
        params: { entry_id: @user_entry.id },
        as: :json
    end

    assert_response :unprocessable_entity
  end

  # =====================
  # POST /api/v1/stories
  # =====================

  test "create persists a story for current user" do
    assert_difference -> { @user.stories.count }, 1 do
      post api_v1_stories_url,
        params: { story: { name: "New Story", queries: [ "q1", "q2" ], source_entry_id: @entry.id } },
        as: :json
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal "New Story", json["name"]
    assert_equal [ "q1", "q2" ], json["queries"]
    assert_equal "active", json["status"]
    assert_equal @entry.id, json["source_entry_id"]
  end

  test "create strips blank queries" do
    post api_v1_stories_url,
      params: { story: { name: "N", queries: [ "real", "  ", "" ] } },
      as: :json

    assert_response :created
    assert_equal [ "real" ], JSON.parse(response.body)["queries"]
  end

  test "create rejects story with no queries" do
    post api_v1_stories_url,
      params: { story: { name: "N", queries: [ "", "  " ] } },
      as: :json

    assert_response :unprocessable_entity
  end

  test "create enqueues an immediate fetch so the user sees initial articles" do
    assert_enqueued_with(job: FetchStoryArticlesJob) do
      post api_v1_stories_url,
        params: { story: { name: "Fetch Me", queries: [ "q1" ] } },
        as: :json
    end

    assert_response :created
    story = @user.stories.find_by(name: "Fetch Me")
    assert_not_nil story
    assert_enqueued_with(job: FetchStoryArticlesJob, args: [ story.id ])
  end

  test "create does not enqueue a fetch when save fails" do
    assert_no_enqueued_jobs only: FetchStoryArticlesJob do
      post api_v1_stories_url,
        params: { story: { queries: [ "q" ] } },
        as: :json
    end

    assert_response :unprocessable_entity
  end

  test "create rejects missing name" do
    post api_v1_stories_url,
      params: { story: { queries: [ "q" ] } },
      as: :json

    assert_response :unprocessable_entity
  end

  # =====================
  # PATCH /api/v1/stories/:id
  # =====================

  test "update renames and re-queries a story" do
    story = @user.stories.create!(name: "Old", queries: [ "q" ], status: "active")

    patch api_v1_story_url(story),
      params: { story: { name: "New Name", queries: [ "q1", "q2" ] } },
      as: :json

    assert_response :success
    story.reload
    assert_equal "New Name", story.name
    assert_equal [ "q1", "q2" ], story.queries
  end

  test "update cannot change status to bogus" do
    story = @user.stories.create!(name: "x", queries: [ "q" ], status: "active")

    patch api_v1_story_url(story),
      params: { story: { status: "bogus" } },
      as: :json

    assert_response :unprocessable_entity
  end

  # =====================
  # POST /api/v1/stories/:id/wrapup
  # =====================

  test "wrapup generates and persists a narrative" do
    story = @user.stories.create!(name: "W", queries: [ "q" ], status: "concluded",
      concluded_at: 1.hour.ago)

    stub_wrapup_generator(narrative: "# W\n\nNarrative body.") do
      post wrapup_api_v1_story_url(story), as: :json
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "# W\n\nNarrative body.", json["wrapup"]
    assert_not_nil json["wrapup_generated_at"]

    story.reload
    assert_equal "# W\n\nNarrative body.", story.wrapup
    assert_not_nil story.wrapup_generated_at
  end

  test "wrapup works on active stories too" do
    story = @user.stories.create!(name: "Active W", queries: [ "q" ], status: "active")

    stub_wrapup_generator(narrative: "narrative text") do
      post wrapup_api_v1_story_url(story), as: :json
    end

    assert_response :success
    assert_equal "narrative text", JSON.parse(response.body)["wrapup"]
  end

  test "wrapup returns 404 for other user's story" do
    other_story = @other_user.stories.create!(name: "Theirs", queries: [ "q" ], status: "concluded")

    post wrapup_api_v1_story_url(other_story), as: :json
    assert_response :not_found
  end

  test "wrapup returns 503 when LLM is unreachable" do
    story = @user.stories.create!(name: "W", queries: [ "q" ], status: "concluded")

    stub_wrapup_generator(error: LlmClient::Unreachable.new("down")) do
      post wrapup_api_v1_story_url(story), as: :json
    end

    assert_response :service_unavailable
    json = JSON.parse(response.body)
    assert_match(/unreachable/i, json["error"])
  end

  test "wrapup returns 422 when generator fails" do
    story = @user.stories.create!(name: "W", queries: [ "q" ], status: "concluded")

    stub_wrapup_generator(error: StoryWrapupGenerator::WrapupFailed.new("empty")) do
      post wrapup_api_v1_story_url(story), as: :json
    end

    assert_response :unprocessable_entity
  end

  test "show includes wrapup fields in the json" do
    story = @user.stories.create!(
      name: "WithWrapup", queries: [ "q" ], status: "concluded",
      wrapup: "# summary", wrapup_generated_at: 1.hour.ago
    )

    get api_v1_story_url(story), as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "# summary", json["wrapup"]
    assert_not_nil json["wrapup_generated_at"]
  end

  # =====================
  # POST /api/v1/stories/:id/fetch
  # =====================

  test "fetch enqueues FetchStoryArticlesJob for the story" do
    story = @user.stories.create!(name: "OnDemand", queries: [ "q" ], status: "active")

    assert_enqueued_with(job: FetchStoryArticlesJob, args: [ story.id ]) do
      post fetch_api_v1_story_url(story), as: :json
    end

    assert_response :accepted
    json = JSON.parse(response.body)
    assert_equal "queued", json["status"]
    assert_equal story.id, json["story_id"]
  end

  test "fetch returns 404 for another user's story" do
    story = @other_user.stories.create!(name: "NotMine", queries: [ "q" ], status: "active")

    assert_no_enqueued_jobs only: FetchStoryArticlesJob do
      post fetch_api_v1_story_url(story), as: :json
    end

    assert_response :not_found
  end

  # =====================
  # DELETE /api/v1/stories/:id
  # =====================

  test "destroy deletes a story" do
    story = @user.stories.create!(name: "gone", queries: [ "q" ], status: "active")

    assert_difference -> { @user.stories.count }, -1 do
      delete api_v1_story_url(story), as: :json
    end
    assert_response :no_content
  end

  private

  # Stubs StoryQueryExtractor#extract for the duration of the block by
  # replacing the instance-level extractor with a fake. Works because
  # the controller memoizes @extractor via StoryQueryExtractor.new.
  def stub_extractor(topic: nil, queries: nil, error: nil)
    fake = Object.new
    fake.define_singleton_method(:extract) do |_entry|
      Kernel.raise(error) if error

      { topic: topic, queries: queries }
    end

    StoryQueryExtractor.stub :new, fake do
      yield
    end
  end

  # Stubs StoryWrapupGenerator#generate for the duration of the block by
  # replacing the instance-level generator with a fake.
  def stub_wrapup_generator(narrative: nil, error: nil)
    fake = Object.new
    fake.define_singleton_method(:generate) do |_story|
      Kernel.raise(error) if error

      narrative
    end

    StoryWrapupGenerator.stub :new, fake do
      yield
    end
  end
end
