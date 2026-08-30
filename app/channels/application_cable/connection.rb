module ApplicationCable
  # Identifies a websocket by the same cookie session the JSON API uses.
  #
  # Api::V1::BaseController#current_user reads User.find_by(id: session[:user_id]);
  # this reads the same key out of the same signed cookie jar, so a browser that
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
        user_id = session_from_cookie&.dig("user_id")
        User.find_by(id: user_id) || reject_unauthorized_connection
      end

      def session_from_cookie
        cookies.encrypted[Rails.application.config.session_options.fetch(:key, "_ttrb_session")]
      end
  end
end
