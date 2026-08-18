require "simplecov"
SimpleCov.start "rails" do
  skip "/test/"
  skip "/config/"
  skip "/db/"
  skip "/vendor/"

  group "Controllers", "app/controllers"
  group "Models", "app/models"
  group "Services", "app/services"
  group "Jobs", "app/jobs"
  group "Mailers", "app/mailers"
end

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
  # Establishes a real session for the rest of the example. /api/v1 has no
  # authentication bypass, so any test touching it must call this first.
  # Every fixture user shares this password (see test/fixtures/users.yml).
  def sign_in(user, password: "password")
    post api_v1_login_url, params: { login: user.login, password: password }, as: :json
    assert_response :success, "sign_in failed for #{user.login}: #{response.body}"
    user
  end
end
