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
  # Run tests in parallel with specified workers.
  #
  # `parallelize` reassigns the single global Minitest.parallel_executor, so the
  # last call at load time decides for the whole run. A `parallelize(workers: 1)`
  # in any test file silently serializes the entire suite; give a test class its
  # own on-disk state instead (below).
  parallelize(workers: :number_of_processors)

  # Workers fork with the same config, so without this every worker shares one
  # image cache directory and one audio cache directory. That is not merely a
  # filename collision: CleanupCachedImagesJob deletes every file in the image
  # cache that its own database has no row for, and each worker has its own
  # database, so one worker's fixture file is another worker's orphan. Rails
  # partitions the databases per worker for the same reason; this partitions the
  # directories that hang off them.
  parallelize_setup do |worker|
    Rails.configuration.x.image_cache.dir = Rails.configuration.x.image_cache.dir.join(worker.to_s)
    Rails.configuration.x.audio_cache.dir = Rails.configuration.x.audio_cache.dir.join(worker.to_s)
  end

  parallelize_teardown do
    FileUtils.rm_rf(Rails.configuration.x.image_cache.dir)
    FileUtils.rm_rf(Rails.configuration.x.audio_cache.dir)
  end

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
