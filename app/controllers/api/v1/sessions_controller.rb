module Api
  module V1
    # Inherits require_auth and current_user from BaseController so the login
    # endpoints cannot drift from the rest of /api/v1; only #create is public.
    class SessionsController < BaseController
      skip_before_action :require_auth, only: :create

      # POST /api/v1/auth/login
      def create
        # Rate limiting check
        if login_rate_limited?(params[:login])
          return render json: { error: "Too many login attempts. Please try again later." }, status: :too_many_requests
        end

        user = User.authenticate(params[:login], params[:password])

        if user
          # Track successful login
          user.update_columns(
            last_login: Time.current,
            last_auth_attempt: nil
          )

          # Create session
          session[:user_id] = user.id
          reset_session_token

          render json: user_json(user)
        else
          # Track failed attempt
          record_failed_attempt(params[:login])
          render json: { error: "Invalid username or password" }, status: :unauthorized
        end
      end

      # DELETE /api/v1/auth/logout
      def destroy
        reset_session
        head :no_content
      end

      # GET /api/v1/auth/me
      def show
        render json: user_json(current_user)
      end

      # POST /api/v1/auth/change_password
      def change_password
        unless current_user.authenticate(params[:current_password])
          return render json: { error: "Current password is incorrect" }, status: :unprocessable_entity
        end

        if params[:new_password].blank? || params[:new_password].length < 8
          return render json: { error: "New password must be at least 8 characters" }, status: :unprocessable_entity
        end

        current_user.password = params[:new_password]
        current_user.save!

        render json: { message: "Password changed successfully" }
      end

      # GET /api/v1/auth/public_feed_key
      def public_feed_key
        access_key = current_user.ensure_access_key!
        render json: {
          access_key: access_key,
          feed_url: public_feed_url(access_key)
        }
      end

      # POST /api/v1/auth/regenerate_public_feed_key
      def regenerate_public_feed_key
        current_user.regenerate_access_key!
        render json: {
          access_key: current_user.access_key,
          feed_url: public_feed_url(current_user.access_key)
        }
      end

      private

      def user_json(user)
        {
          id: user.id,
          login: user.login,
          email: user.email,
          full_name: user.full_name,
          access_level: user.access_level,
          is_admin: user.admin?,
          last_login: user.last_login
        }
      end

      def reset_session_token
        # Regenerate session ID to prevent session fixation
        request.session_options[:renew] = true
      end

      # Simple rate limiting using database
      def login_rate_limited?(login)
        return false if login.blank?

        user = User.find_by(login: login)
        return false unless user&.last_auth_attempt

        # Allow 5 attempts per 15 minutes
        user.last_auth_attempt > 15.minutes.ago
      end

      def record_failed_attempt(login)
        return if login.blank?

        user = User.find_by(login: login)
        user&.update_column(:last_auth_attempt, Time.current)
      end
    end
  end
end
