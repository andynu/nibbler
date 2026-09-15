require "simplecov"

# The "rails" profile already skips config/ and db/ and defines the Controllers,
# Channels, Models, Mailers, Helpers, Jobs and Libraries groups; SimpleCov's own
# defaults already skip test/. Only the additions belong here.
SimpleCov.start "rails" do
  skip "/vendor/"

  group "Services", "app/services"
end

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "webmock/minitest"

# Allow localhost connections for integration tests but block external by default
WebMock.disable_net_connect!(allow_localhost: true)

class ActiveSupport::TestCase
  # Deliberately serial, with no `parallelize`: Rails would create a database per
  # worker that it never drops, and the on-disk caches would each need a
  # per-worker directory again.

  # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
  fixtures :all

  # Give the outbound destination guard a hostname -> addresses map for the
  # duration of the block, instead of the test environment's default resolver
  # that resolves nothing (see config/environments/test.rb).
  #
  # Names absent from the map still resolve to nothing, so a test can make one
  # host internal without every other stubbed host in the example needing an
  # entry.
  def with_dns(map)
    previous = Rails.configuration.x.outbound_http.resolver
    Rails.configuration.x.outbound_http.resolver = ->(host) { Array(map[host]) }
    yield
  ensure
    Rails.configuration.x.outbound_http.resolver = previous
  end
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
