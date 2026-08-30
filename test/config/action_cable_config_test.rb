require "test_helper"
require "yaml"

# Guards the Action Cable wiring, all of which fails quietly when it is wrong.
#
# The adapter choice is the one that matters most. Both development and
# production set good_job.execution_mode :external, so a broadcast originates in
# `bin/jobs` and the browser's socket is held by Puma. The :async adapter is an
# in-process bus: the job process accepts the broadcast, finds no subscriber of
# its own, and drops it. Nothing raises, nothing is logged, and the browser waits
# forever. That is what the generator ships as the development default, so this
# has to be asserted rather than assumed.
class ActionCableConfigTest < ActiveSupport::TestCase
  # Every environment whose jobs run in a process other than the web server.
  OUT_OF_PROCESS_JOB_ENVIRONMENTS = %w[development production].freeze

  test "environments that run jobs out of process use a cross-process cable adapter" do
    OUT_OF_PROCESS_JOB_ENVIRONMENTS.each do |env|
      assert_equal "solid_cable", cable_config.fetch(env).fetch("adapter"),
        "#{env} runs GoodJob externally, so an in-process adapter would drop every broadcast silently"
    end
  end

  test "the test environment does not poll a database it has no cable entry for" do
    assert_equal "test", cable_config.fetch("test").fetch("adapter")
  end

  # cable.yml naming a database that database.yml does not define is the failure
  # that only shows up at the first subscribe, in whichever environment was not
  # checked.
  test "every solid_cable environment names a database config/database.yml defines" do
    OUT_OF_PROCESS_JOB_ENVIRONMENTS.each do |env|
      writing = cable_config.fetch(env).dig("connects_to", "database", "writing")

      assert_equal "cable", writing, "#{env} must write to the cable database"
      assert_includes database_names(env), writing,
        "config/database.yml has no #{writing.inspect} entry for #{env}"
    end
  end

  test "solid_cable trims what it writes" do
    OUT_OF_PROCESS_JOB_ENVIRONMENTS.each do |env|
      assert_equal "1.day", cable_config.fetch(env).fetch("message_retention"),
        "without retention solid_cable_messages grows without bound"
    end
  end

  test "the cable server is mounted" do
    mount_path = ActionCable.server.config.mount_path

    assert_equal "/cable", mount_path
    assert_equal 1, mounted_cable_routes.size,
      "ActionCable::Engine mounts /cable itself; drawing it again in config/routes.rb duplicates the endpoint"
  end

  # config/database.yml sizes the primary pool as RAILS_MAX_THREADS +
  # ACTION_CABLE_WORKER_POOL_SIZE. If the server ignored that variable the two
  # would drift the first time either was tuned, and the symptom would be
  # websocket handshakes timing out on connection checkout.
  test "the worker pool is sized from the variable database.yml budgets for" do
    assert_equal ENV.fetch("ACTION_CABLE_WORKER_POOL_SIZE", 4).to_i,
      ActionCable.server.config.worker_pool_size
  end

  test "the connection class is the application's own" do
    assert_equal ApplicationCable::Connection, ActionCable.server.config.connection_class.call
  end

  private
    def cable_config
      @cable_config ||= YAML.safe_load(ERB.new(Rails.root.join("config/cable.yml").read).result, aliases: true)
    end

    def database_names(env)
      raw = YAML.safe_load(ERB.new(Rails.root.join("config/database.yml").read).result, aliases: true)
      raw.fetch(env).keys
    end

    def mounted_cable_routes
      Rails.application.routes.routes.select { |route| route.path.spec.to_s == "/cable" }
    end
end
