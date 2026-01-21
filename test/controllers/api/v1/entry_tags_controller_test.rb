require "test_helper"

class Api::V1::EntryTagsControllerTest < ActionDispatch::IntegrationTest
  def setup
    # Use User.first since BaseController falls back to it in test mode
    @user = User.first
    @feed = feeds(:high_frequency)
    @entry = entries(:basic)
    # Create a UserEntry for the test
    @user_entry = @user.user_entries.create!(
      entry: @entry,
      feed: @feed,
      uuid: SecureRandom.uuid,
      unread: true
    )
  end

  def entry_tags_count
    @entry.tags.where(user_id: @user.id).count
  end

  test "create adds a tag to an entry" do
    original_count = entry_tags_count

    post api_v1_entry_tags_url(@user_entry.id),
      params: { tag_name: "tech" },
      as: :json

    assert_response :success
    assert_equal original_count + 1, entry_tags_count

    json = JSON.parse(response.body)
    assert_equal 1, json["tags"].length
    assert_equal "tech", json["tags"].first["name"]
    assert json["tags"].first["id"].present?, "Tag should have an id"
    assert json["tags"].first["fg_color"].present?, "Tag should have fg_color"
    assert json["tags"].first["bg_color"].present?, "Tag should have bg_color"
    assert_equal @user_entry.id, json["entry_id"]

    # Verify tag was created and linked to entry
    tag = @user.tags.find_by(name: "tech")
    assert tag, "Tag should be created"
    assert @entry.tags.include?(tag), "Entry should have the tag"
  end

  test "create adds multiple tags at once" do
    original_count = entry_tags_count

    post api_v1_entry_tags_url(@user_entry.id),
      params: { tag_names: [ "tech", "news", "ruby" ] },
      as: :json

    assert_response :success
    assert_equal original_count + 3, entry_tags_count

    json = JSON.parse(response.body)
    tag_names = json["tags"].map { |t| t["name"] }.sort
    assert_equal [ "news", "ruby", "tech" ], tag_names
  end

  test "create normalizes tag names to lowercase" do
    post api_v1_entry_tags_url(@user_entry.id),
      params: { tag_name: "  TECH  " },
      as: :json

    assert_response :success

    json = JSON.parse(response.body)
    tag_names = json["tags"].map { |t| t["name"] }
    assert_equal [ "tech" ], tag_names
  end

  test "create ignores duplicate tags" do
    # Create an existing tag and link it to the entry
    tag = @user.tags.create!(name: "tech", bg_color: "#64748b", fg_color: "#ffffff")
    EntryTag.create!(entry: @entry, tag: tag)

    original_count = entry_tags_count

    post api_v1_entry_tags_url(@user_entry.id),
      params: { tag_name: "tech" },
      as: :json

    assert_response :success
    assert_equal original_count, entry_tags_count
  end

  test "create ignores blank tag names" do
    original_count = entry_tags_count

    post api_v1_entry_tags_url(@user_entry.id),
      params: { tag_name: "  " },
      as: :json

    assert_response :success
    assert_equal original_count, entry_tags_count
  end

  test "destroy removes a tag from an entry" do
    # Create tags and link them to the entry
    tech_tag = @user.tags.create!(name: "tech", bg_color: "#64748b", fg_color: "#ffffff")
    news_tag = @user.tags.create!(name: "news", bg_color: "#64748b", fg_color: "#ffffff")
    EntryTag.create!(entry: @entry, tag: tech_tag)
    EntryTag.create!(entry: @entry, tag: news_tag)

    original_count = entry_tags_count

    delete api_v1_entry_tag_url(@user_entry.id, "tech"),
      as: :json

    assert_response :success
    assert_equal original_count - 1, entry_tags_count

    json = JSON.parse(response.body)
    tag_names = json["tags"].map { |t| t["name"] }
    assert_equal [ "news" ], tag_names
  end

  test "destroy handles non-existent tags gracefully" do
    original_count = entry_tags_count

    delete api_v1_entry_tag_url(@user_entry.id, "nonexistent"),
      as: :json

    assert_response :success
    assert_equal original_count, entry_tags_count
  end

  test "returns 404 for non-existent user_entry" do
    post api_v1_entry_tags_url(999999),
      params: { tag_name: "tech" },
      as: :json

    assert_response :not_found
  end
end
