require "test_helper"
require "erb"
require "yaml"

# Guards the production multi-database wiring in config/database.yml.
#
# The cache entry must resolve to its own database. When it inherited the
# primary's `url:`, Rails merged the URL over the explicit `database:` key and
# both entries pointed at nibbler_production. db:prepare then saw
# schema_migrations already present, skipped db/cache_schema.rb, and
# solid_cache_entries was never created -- every Rails.cache call in production
# raised PG::UndefinedTable.
class DatabaseConfigTest < ActiveSupport::TestCase
  PRIMARY_URL = "postgres://nibbler:secret@nibbler-db:5432/nibbler_production".freeze

  test "production cache database is distinct from the primary database" do
    primary, cache = production_configs

    assert_equal "nibbler_production", primary.database
    assert_equal "nibbler_production_cache", cache.database
    refute_equal primary.database, cache.database,
      "cache must not resolve to the primary database or db:prepare will skip its schema load"
  end

  test "production cache reuses the primary host and credentials" do
    primary, cache = production_configs

    assert_equal primary.host, cache.host
    assert_equal primary.configuration_hash[:username], cache.configuration_hash[:username]
    assert_equal primary.configuration_hash[:password], cache.configuration_hash[:password]
  end

  test "CACHE_DATABASE_URL overrides the derived cache url" do
    _primary, cache = production_configs("CACHE_DATABASE_URL" => "postgres://cu:cp@cachehost:5432/elsewhere")

    assert_equal "elsewhere", cache.database
    assert_equal "cachehost", cache.host
  end

  test "cache schema dump and migrations path exist on disk" do
    _primary, cache = production_configs

    assert_path_exists Rails.root.join("db", cache.schema_dump)
    assert_path_exists Rails.root.join(cache.migrations_paths),
      "migrations_paths must exist so db:prepare does not fall back to db/migrate"
  end

  # Solid Cable repeats the cache entry's shape, and would repeat its failure:
  # inheriting the primary's `url:` collapses the cable database into the
  # primary, db:prepare skips db/cable_schema.rb, and solid_cable_messages never
  # exists. The cache version raised on every request. This one would not raise
  # at all -- subscribing and broadcasting would simply stop working.
  test "production cable database is distinct from the primary database" do
    primary = production_config("primary")
    cable = production_config("cable")

    assert_equal "nibbler_production_cable", cable.database
    refute_equal primary.database, cable.database,
      "cable must not resolve to the primary database or db:prepare will skip its schema load"
  end

  test "production cable is distinct from the cache database too" do
    _primary, cache = production_configs

    refute_equal cache.database, production_config("cable").database
  end

  test "production cable reuses the primary host and credentials" do
    primary = production_config("primary")
    cable = production_config("cable")

    assert_equal primary.host, cable.host
    assert_equal primary.configuration_hash[:username], cable.configuration_hash[:username]
    assert_equal primary.configuration_hash[:password], cable.configuration_hash[:password]
  end

  test "CABLE_DATABASE_URL overrides the derived cable url" do
    cable = production_config("cable", "CABLE_DATABASE_URL" => "postgres://bu:bp@cablehost:5432/elsewhere")

    assert_equal "elsewhere", cable.database
    assert_equal "cablehost", cable.host
  end

  test "cable schema dump and migrations path exist on disk" do
    cable = production_config("cable")

    assert_path_exists Rails.root.join("db", cable.schema_dump)
    assert_path_exists Rails.root.join(cable.migrations_paths),
      "migrations_paths must exist so db:prepare does not fall back to db/migrate"
  end

  # Development is multi-database for the cable alone. config/cable.yml runs
  # solid_cable here rather than :async so the cross-process path is exercised
  # locally, which only works if `cable` names a real database.
  test "development cable database is distinct from the primary database" do
    primary = development_config("primary")
    cable = development_config("cable")

    assert_equal "ttrb_development", primary.database
    assert_equal "ttrb_development_cable", cable.database
  end

  test "development cable shares the primary connection details" do
    primary = development_config("primary")
    cable = development_config("cable")

    assert_equal primary.host, cable.host
    assert_equal primary.configuration_hash[:username], cable.configuration_hash[:username]
    assert_equal primary.configuration_hash[:password], cable.configuration_hash[:password]
    assert_equal "db/cable_migrate", cable.migrations_paths
  end

  # The web role holds Puma's threads and Action Cable's worker pool at the same
  # time; the job role holds GoodJob's threads plus its 2 utility threads. The
  # pool has to cover whichever is larger, and Action Cable was invisible to this
  # formula until the cable landed.
  test "pool covers Puma's threads plus Action Cable's worker pool" do
    raw = render_database_yml(
      "RAILS_MAX_THREADS" => "7", "ACTION_CABLE_WORKER_POOL_SIZE" => "3", "GOOD_JOB_MAX_THREADS" => "2"
    )

    assert_equal 10, raw["development"]["primary"]["max_connections"]
  end

  test "pool still covers GoodJob when the job role is the larger of the two" do
    raw = render_database_yml(
      "RAILS_MAX_THREADS" => "1", "ACTION_CABLE_WORKER_POOL_SIZE" => "1", "GOOD_JOB_MAX_THREADS" => "20"
    )

    assert_equal 22, raw["development"]["primary"]["max_connections"]
  end

  private
    # Renders config/database.yml under a controlled environment and returns the
    # resolved [primary, cache] production configs.
    def production_configs(env = {})
      configs = resolved_configs("production", env)

      [ configs.find { |c| c.name == "primary" }, configs.find { |c| c.name == "cache" } ]
    end

    def production_config(name, env = {})
      resolved_configs("production", env).find { |c| c.name == name }
    end

    def development_config(name)
      resolved_configs("development").find { |c| c.name == name }
    end

    def resolved_configs(env_name, env = {})
      defaults = { "DATABASE_URL" => PRIMARY_URL, "CACHE_DATABASE_URL" => nil, "CABLE_DATABASE_URL" => nil }
      raw = render_database_yml(defaults.merge(env))

      ActiveRecord::DatabaseConfigurations.new(env_name => raw[env_name]).configs_for(env_name: env_name)
    end

    def render_database_yml(env)
      original = env.keys.to_h { |key| [ key, ENV[key] ] }
      env.each { |key, value| ENV[key] = value }

      rendered = ERB.new(Rails.root.join("config/database.yml").read).result
      YAML.safe_load(rendered, aliases: true)
    ensure
      original.each { |key, value| ENV[key] = value }
    end
end
