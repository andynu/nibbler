require "test_helper"

class Api::V1::CategoriesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = sign_in(users(:one))
    @tech = @user.categories.create!(title: "Tech")
    @ruby = @user.categories.create!(title: "Ruby", parent: @tech)
  end

  test "update reparents a category under one that is not below it" do
    news = @user.categories.create!(title: "News")

    patch api_v1_category_url(news), params: { category: { parent_id: @tech.id } }, as: :json

    assert_response :success
    assert_equal @tech.id, news.reload.parent_id
  end

  test "update refuses a parent that is the category's own descendant" do
    patch api_v1_category_url(@tech), params: { category: { parent_id: @ruby.id } }, as: :json

    assert_response :unprocessable_entity
    assert_nil @tech.reload.parent_id
    assert_includes JSON.parse(response.body)["errors"],
      "Parent cannot be one of this category's own descendants"
  end

  test "update refuses a category as its own parent" do
    patch api_v1_category_url(@tech), params: { category: { parent_id: @tech.id } }, as: :json

    assert_response :unprocessable_entity
    assert_nil @tech.reload.parent_id
  end

  test "reorder moves a category and keeps its new position" do
    patch reorder_api_v1_category_url(@ruby), params: { order_id: 3, parent_id: nil }, as: :json

    assert_response :success
    assert_nil @ruby.reload.parent_id
    assert_equal 3, @ruby.order_id
  end

  test "reorder refuses a parent that is the category's own descendant" do
    patch reorder_api_v1_category_url(@tech),
      params: { order_id: 0, parent_id: @ruby.id }, as: :json

    assert_response :unprocessable_entity
    assert_nil @tech.reload.parent_id
  end
end
