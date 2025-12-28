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
      unread: true,
      tag_cache: ""
    )
  end

  test "create adds a tag to an entry" do
    assert_difference "@user_entry.tags.count", 1 do
      post api_v1_entry_tags_url(@user_entry.id),
        params: { tag_name: "tech" },
        as: :json

      assert_response :success
    end

    json = JSON.parse(response.body)
    assert_equal [ "tech" ], json["tags"]
    assert_equal @user_entry.id, json["entry_id"]

    # Verify tag was created
    assert @user_entry.tags.exists?(tag_name: "tech")

    # Verify tag_cache was updated
    @user_entry.reload
    assert_equal "tech", @user_entry.tag_cache
  end

  test "create adds multiple tags at once" do
    assert_difference "@user_entry.tags.count", 3 do
      post api_v1_entry_tags_url(@user_entry.id),
        params: { tag_names: [ "tech", "news", "ruby" ] },
        as: :json

      assert_response :success
    end

    json = JSON.parse(response.body)
    assert_equal [ "news", "ruby", "tech" ], json["tags"].sort

    @user_entry.reload
    assert_equal "news,ruby,tech", @user_entry.tag_cache
  end

  test "create normalizes tag names to lowercase" do
    post api_v1_entry_tags_url(@user_entry.id),
      params: { tag_name: "  TECH  " },
      as: :json

    assert_response :success

    json = JSON.parse(response.body)
    assert_equal [ "tech" ], json["tags"]
  end

  test "create ignores duplicate tags" do
    @user_entry.tags.create!(tag_name: "tech", user: @user)

    assert_no_difference "@user_entry.tags.count" do
      post api_v1_entry_tags_url(@user_entry.id),
        params: { tag_name: "tech" },
        as: :json

      assert_response :success
    end
  end

  test "create ignores blank tag names" do
    assert_no_difference "@user_entry.tags.count" do
      post api_v1_entry_tags_url(@user_entry.id),
        params: { tag_name: "  " },
        as: :json

      assert_response :success
    end
  end

  test "destroy removes a tag from an entry" do
    @user_entry.tags.create!(tag_name: "tech", user: @user)
    @user_entry.tags.create!(tag_name: "news", user: @user)
    @user_entry.update!(tag_cache: "news,tech")

    assert_difference "@user_entry.tags.count", -1 do
      delete api_v1_entry_tag_url(@user_entry.id, "tech"),
        as: :json

      assert_response :success
    end

    json = JSON.parse(response.body)
    assert_equal [ "news" ], json["tags"]

    @user_entry.reload
    assert_equal "news", @user_entry.tag_cache
  end

  test "destroy handles non-existent tags gracefully" do
    assert_no_difference "@user_entry.tags.count" do
      delete api_v1_entry_tag_url(@user_entry.id, "nonexistent"),
        as: :json

      assert_response :success
    end
  end

  test "returns 404 for non-existent user_entry" do
    post api_v1_entry_tags_url(999999),
      params: { tag_name: "tech" },
      as: :json

    assert_response :not_found
  end
end
