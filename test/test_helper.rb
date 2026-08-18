require "simplecov"

# `parallelize` forks a worker per core and each worker leaves its own entry in
# coverage/.resultset.json. Those entries outlive the run, so the next run reads
# them back: a single-process run (Rails skips forking under 50 tests) merges the
# previous run's slices into its own report, and once they age past merge_timeout
# every run prints "[SimpleCov]: Excluded N result(s) older than merge_timeout".
# Both are wrong for a suite that always reports from one invocation. Clearing the
# file here happens in the parent, before any worker forks, so a run's report
# covers exactly that run. The cost is that coverage no longer accumulates across
# separate `rails test` invocations.
resultset = SimpleCov::ResultMerger.resultset_path
File.delete(resultset) if File.exist?(resultset)

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
