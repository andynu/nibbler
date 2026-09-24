require "test_helper"

class Api::V1::SessionsControllerTest < ActionDispatch::IntegrationTest
  SESSION_LIFETIME = Rails.application.config.session_options[:expire_after]

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

  # =====================
  # Login rate limiting
  # =====================

  test "a single failed attempt is recorded but does not lock the account" do
    # Regression: the limit used to trip on any attempt stamped inside the
    # window, so one typo cost fifteen minutes and only a successful login
    # cleared it -- which the lockout itself made impossible.
    post api_v1_login_url, params: { login: @user.login, password: "wrong" }, as: :json
    assert_response :unauthorized
    assert_equal 1, @user.reload.failed_auth_attempts
    assert_not_nil @user.last_auth_attempt

    post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
    assert_response :success
  end

  test "the attempt after the limit is rejected even with the right password" do
    fail_login(times: Api::V1::SessionsController::MAX_FAILED_LOGIN_ATTEMPTS)
    assert_equal 5, @user.reload.failed_auth_attempts

    post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
    assert_response :too_many_requests
  end

  test "a successful login clears the attempt count" do
    fail_login(times: 4)
    assert_equal 4, @user.reload.failed_auth_attempts

    post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
    assert_response :success

    @user.reload
    assert_equal 0, @user.failed_auth_attempts
    assert_nil @user.last_auth_attempt
  end

  test "the lockout lifts once the window passes" do
    fail_login(times: Api::V1::SessionsController::MAX_FAILED_LOGIN_ATTEMPTS)

    post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
    assert_response :too_many_requests

    travel(Api::V1::SessionsController::FAILED_LOGIN_WINDOW + 1.minute) do
      post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
      assert_response :success
    end
  end

  test "a failure outside the window starts the count over" do
    fail_login(times: 3)
    assert_equal 3, @user.reload.failed_auth_attempts

    travel(Api::V1::SessionsController::FAILED_LOGIN_WINDOW + 1.minute) do
      fail_login(times: 1)
      assert_equal 1, @user.reload.failed_auth_attempts
    end
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

  test "logout revokes a copy of the session cookie taken before it" do
    sign_in(@user)
    copied = cookies[session_key]

    delete api_v1_logout_url, as: :json
    assert_response :no_content

    cookies[session_key] = copied
    get api_v1_me_url, as: :json
    assert_response :unauthorized
  end

  test "logout signs out the user's other browsers too" do
    sign_in(@user)
    other = open_session
    other.post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
    assert_equal 200, other.response.status

    delete api_v1_logout_url, as: :json

    other.get api_v1_me_url, as: :json
    assert_equal 401, other.response.status
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

  test "change_password keeps the current session and ends every other one" do
    other = open_session
    other.post api_v1_login_url, params: { login: @user.login, password: "password" }, as: :json
    assert_equal 200, other.response.status
    sign_in(@user)

    post api_v1_change_password_url,
      params: { current_password: "password", new_password: "newpassword" }, as: :json
    assert_response :success

    get api_v1_me_url, as: :json
    assert_response :success

    other.get api_v1_me_url, as: :json
    assert_equal 401, other.response.status
  end

  # =====================
  # Session lifetime
  # =====================

  test "sessions last at least a week" do
    assert_operator SESSION_LIFETIME.to_i, :>=, 1.week.to_i
  end

  test "a session survives SESSION_LIFETIME minus a day without a request" do
    sign_in(@user)

    travel(SESSION_LIFETIME - 1.day) do
      get api_v1_me_url, as: :json
      assert_response :success
    end
  end

  test "a session ends once SESSION_LIFETIME passes without a request" do
    sign_in(@user)

    travel(SESSION_LIFETIME + 1.day) do
      get api_v1_me_url, as: :json
      assert_response :unauthorized
    end
  end

  test "an expired session cookie replayed by hand is refused" do
    sign_in(@user)
    copied = cookies[session_key]

    travel(SESSION_LIFETIME + 1.day) do
      cookies[session_key] = copied
      get api_v1_me_url, as: :json
      assert_response :unauthorized
    end
  end

  test "each request restarts the session's lifetime" do
    sign_in(@user)

    travel(SESSION_LIFETIME - 1.day)
    get api_v1_me_url, as: :json
    assert_response :success

    travel(SESSION_LIFETIME - 1.day)
    get api_v1_me_url, as: :json
    assert_response :success
  ensure
    travel_back
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

  private

  def session_key
    Rails.application.config.session_options.fetch(:key)
  end

  def fail_login(times:)
    times.times do
      post api_v1_login_url, params: { login: @user.login, password: "wrong" }, as: :json
      assert_response :unauthorized
    end
  end
end
