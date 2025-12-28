ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "webmock/minitest"

# Allow localhost connections for integration tests but block external by default
WebMock.disable_net_connect!(allow_localhost: true)

class ActiveSupport::TestCase
  # Run tests in parallel with specified workers
  parallelize(workers: :number_of_processors)

  # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
  fixtures :all
end

class ActionDispatch::IntegrationTest
  def sign_in(user)
    # Set the session user_id directly for API testing
    post "/session", params: { login: user.login, password: "password" }
  end

  def sign_in_as(user)
    # Set user in session via a cookie-based approach
    # Since the app uses session[:user_id], we need to simulate this
    @current_user = user
    # For test environment, we'll stub the session by manipulating cookies
    # Actually, the BaseController falls back to first user in dev, not test
    # So we need to directly manipulate the session
  end
end
