require "test_helper"

module ApplicationCable
  class ConnectionTest < ActionCable::Connection::TestCase
    tests ApplicationCable::Connection

    SESSION_KEY = "_ttrb_session".freeze

    test "identifies the user named by the session cookie" do
      set_session(user_id: users(:one).id)

      connect

      assert_equal users(:one), connection.current_user
    end

    test "rejects a connection with no session cookie" do
      assert_reject_connection { connect }
    end

    test "rejects a session cookie with no user_id" do
      set_session(some_other_key: "irrelevant")

      assert_reject_connection { connect }
    end

    test "rejects a session naming a user that no longer exists" do
      set_session(user_id: User.maximum(:id).to_i + 1)

      assert_reject_connection { connect }
    end

    # The session cookie is encrypted, not signed. Reading it out of the signed
    # jar has to fail, or a forged-but-unencrypted cookie would be one step
    # closer to being accepted.
    test "ignores a session presented in the signed cookie jar" do
      cookies.signed[SESSION_KEY] = { value: { "user_id" => users(:one).id } }

      assert_reject_connection { connect }
    end

    test "reads the session key out of config rather than hardcoding it" do
      assert_equal SESSION_KEY, Rails.application.config.session_options[:key],
        "the connection derives the cookie name from session_options; this test's constant has to match"
    end

    private
      # ActionCable::Connection::TestCookies#[]= treats a Hash as the options
      # form (`cookies[name] = { value:, expires: }`), so a session hash assigned
      # directly is read as options with no :value and stored as nil. Wrapping it
      # is the difference between testing the connection and testing nothing.
      def set_session(attributes)
        cookies.encrypted[SESSION_KEY] = { value: attributes.stringify_keys }
      end
  end
end
