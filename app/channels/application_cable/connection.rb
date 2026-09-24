module ApplicationCable
  # Identifies a websocket by the same cookie session the JSON API uses.
  #
  # Api::V1::BaseController#current_user checks session[:user_id] and
  # session[:session_token] with User.find_by_session; this reads the same keys
  # out of the same encrypted cookie jar, so a browser that
  # is logged in for /api/v1 is logged in for the cable and one that is not gets
  # refused at the handshake rather than reaching a channel.
  #
  # `cookies.encrypted[Rails.application.config.session_options[:key]]` is the
  # cable-side equivalent of `session`: Action Cable has no request cycle and so
  # no session object, but the session cookie is an encrypted cookie like any
  # other. Reading the key from config keeps this in step if the session store
  # is ever renamed.
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end

    private
      def find_verified_user
        session = session_from_cookie
        User.find_by_session(session&.dig("user_id"), session&.dig("session_token")) ||
          reject_unauthorized_connection
      end

      def session_from_cookie
        cookies.encrypted[Rails.application.config.session_options.fetch(:key, "_ttrb_session")]
      end
  end
end
