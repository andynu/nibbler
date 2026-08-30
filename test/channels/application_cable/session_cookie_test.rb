require "test_helper"

# ApplicationCable::Connection reads the signed-in user out of the encrypted
# session cookie, which is the only thing a websocket handshake carries. That
# leans on three details of how the HTTP side writes the cookie -- its name, that
# it is encrypted rather than signed, and that the deserialized session is a hash
# with a string "user_id" key. None of them are visible from the connection unit
# test, which substitutes a fake cookie jar, so this pins them against a session
# produced by a real login.
class ApplicationCableSessionCookieTest < ActionDispatch::IntegrationTest
  test "a real login writes a session the cable connection can read" do
    user = users(:one)
    sign_in(user)

    session_data = decrypted_session

    assert_not_nil session_data, "no encrypted session cookie under #{session_key.inspect} after login"
    assert_equal user.id, session_data["user_id"]
  end

  test "the session cookie survives being read back as ApplicationCable::Connection reads it" do
    user = users(:one)
    sign_in(user)

    assert_equal user, User.find_by(id: decrypted_session&.dig("user_id"))
  end

  private
    def session_key
      Rails.application.config.session_options.fetch(:key)
    end

    def decrypted_session
      jar = ActionDispatch::Cookies::CookieJar.build(request, cookies.to_hash)
      jar.encrypted[session_key]
    end
end
