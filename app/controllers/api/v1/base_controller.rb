module Api
  module V1
    class BaseController < ApplicationController
      skip_forgery_protection

      before_action :require_auth

      private

      def require_auth
        unless current_user
          # Fall back to first user only when explicitly enabled (for dev/test convenience)
          if ENV["ALLOW_DEV_AUTH"] == "1" && User.exists?
            @current_user = User.first
          else
            render json: { error: "Authentication required" }, status: :unauthorized
          end
        end
      end

      def current_user
        @current_user ||= User.find_by(id: session[:user_id])
      end
    end
  end
end
