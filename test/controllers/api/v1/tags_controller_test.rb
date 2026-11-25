require "test_helper"

class Api::V1::TagsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = sign_in(users(:one))
    @tag = @user.tags.create!(name: "ruby")
  end

  test "index serializes the paper settings" do
    get api_v1_tags_url, as: :json

    assert_response :success
    json = JSON.parse(response.body).find { |t| t["id"] == @tag.id }
    assert_equal false, json["include_in_paper"]
    assert_equal 5, json["paper_limit"]
  end

  test "update persists and returns the paper settings" do
    patch api_v1_tag_url(@tag),
      params: { tag: { include_in_paper: true, paper_limit: 3 } },
      as: :json

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal true, json["include_in_paper"]
    assert_equal 3, json["paper_limit"]

    @tag.reload
    assert @tag.include_in_paper
    assert_equal 3, @tag.paper_limit
  end

  test "update rejects a non-positive paper limit" do
    patch api_v1_tag_url(@tag),
      params: { tag: { paper_limit: 0 } },
      as: :json

    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body)["errors"], "Paper limit must be greater than 0"
    assert_equal 5, @tag.reload.paper_limit
  end
end
