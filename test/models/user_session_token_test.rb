require "test_helper"

class UserSessionTokenTest < ActiveSupport::TestCase
  setup do
    @user = users(:one)
  end

  test "find_by_session accepts the user's current token" do
    token = @user.current_session_token

    assert_equal @user, User.find_by_session(@user.id, token)
  end

  test "find_by_session rejects a missing or wrong token" do
    @user.current_session_token

    assert_nil User.find_by_session(@user.id, nil)
    assert_nil User.find_by_session(@user.id, "")
    assert_nil User.find_by_session(@user.id, "not-the-token")
  end

  test "find_by_session rejects any token while the user has none" do
    @user.update_column(:session_token, nil)

    assert_nil User.find_by_session(@user.id, "")
    assert_nil User.find_by_session(@user.id, nil)
  end

  test "current_session_token is stable across logins until revoked" do
    first = @user.current_session_token

    assert_equal first, @user.reload.current_session_token

    @user.revoke_sessions!
    assert_not_equal first, @user.reload.current_session_token
  end

  test "changing the password by any route revokes existing sessions" do
    token = @user.current_session_token

    @user.update!(password: "a different password")

    assert_nil User.find_by_session(@user.id, token)
  end

  test "saving without a password change keeps existing sessions" do
    token = @user.current_session_token

    @user.update!(full_name: "Renamed")

    assert_equal @user, User.find_by_session(@user.id, token)
  end
end
