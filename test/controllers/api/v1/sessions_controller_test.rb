require "test_helper"

class Api::V1::SessionsControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = users(:one)
  end

  # =====================
  # POST /api/v1/auth/login
  # =====================

  test "login with valid credentials returns the user and opens a session" do
    post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal @user.id, json["id"]
    assert_equal @user.login, json["login"]
    assert_nil json["password_digest"]

    get api_v1_me_url, as: :json
    assert_response :success
    assert_equal @user.login, JSON.parse(response.body)["login"]
  end

  test "login with an invalid password returns 401 and opens no session" do
    post api_v1_login_url, params: { login: @user.login, password: "wrong" }, as: :json
    assert_response :unauthorized
    assert_equal "Invalid username or password", JSON.parse(response.body)["error"]

    get api_v1_me_url, as: :json
    assert_response :unauthorized
  end

  test "login records the failed attempt and rate limits the next try" do
    post api_v1_login_url, params: { login: @user.login, password: "wrong" }, as: :json
    assert_response :unauthorized
    assert_not_nil @user.reload.last_auth_attempt

    post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
    assert_response :too_many_requests
  end

  # =====================
  # GET /api/v1/auth/me
  # =====================

  test "me requires authentication just like the rest of /api/v1" do
    # Regression: SessionsController used to define its own require_auth, so a
    # change to BaseController's could leave the two halves disagreeing about
    # who is signed in. They must answer identically for an anonymous request.
    get api_v1_me_url, as: :json
    assert_response :unauthorized
    me_body = JSON.parse(response.body)

    get api_v1_feeds_url, as: :json
    assert_response :unauthorized
    assert_equal me_body, JSON.parse(response.body)
  end

  test "me returns the signed in user" do
    sign_in(@user)

    get api_v1_me_url, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal @user.login, json["login"]
    assert_equal @user.email, json["email"]
    assert_equal @user.admin?, json["is_admin"]
  end

  # =====================
  # DELETE /api/v1/auth/logout
  # =====================

  test "logout ends the session" do
    sign_in(@user)

    delete api_v1_logout_url, as: :json
    assert_response :no_content

    get api_v1_me_url, as: :json
    assert_response :unauthorized
  end

  test "logout without a session returns 401" do
    delete api_v1_logout_url, as: :json
    assert_response :unauthorized
  end

  # =====================
  # POST /api/v1/auth/change_password
  # =====================

  test "change_password requires authentication" do
    post api_v1_change_password_url,
      params: { current_password: "password", new_password: "newpassword" }, as: :json
    assert_response :unauthorized
  end

  test "change_password rejects a wrong current password" do
    sign_in(@user)

    post api_v1_change_password_url,
      params: { current_password: "wrong", new_password: "newpassword" }, as: :json
    assert_response :unprocessable_entity
    assert @user.reload.authenticate("password")
  end

  test "change_password rejects a new password under eight characters" do
    sign_in(@user)

    post api_v1_change_password_url,
      params: { current_password: "password", new_password: "short" }, as: :json
    assert_response :unprocessable_entity
    assert @user.reload.authenticate("password")
  end

  test "change_password updates the password" do
    sign_in(@user)

    post api_v1_change_password_url,
      params: { current_password: "password", new_password: "newpassword" }, as: :json
    assert_response :success
    assert @user.reload.authenticate("newpassword")
  end

  # =====================
  # Public feed key
  # =====================

  test "public_feed_key requires authentication" do
    get api_v1_public_feed_key_url, as: :json
    assert_response :unauthorized
  end

  test "public_feed_key returns a key and its feed url" do
    sign_in(@user)

    get api_v1_public_feed_key_url, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal @user.reload.access_key, json["access_key"]
    assert_includes json["feed_url"], json["access_key"]
  end

  test "regenerate_public_feed_key issues a different key" do
    sign_in(@user)
    get api_v1_public_feed_key_url, as: :json
    original = JSON.parse(response.body)["access_key"]

    post api_v1_regenerate_public_feed_key_url, as: :json
    assert_response :success

    assert_not_equal original, JSON.parse(response.body)["access_key"]
  end
end
