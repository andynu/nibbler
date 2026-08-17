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

  private
    # Renders config/database.yml under a controlled environment and returns the
    # resolved [primary, cache] production configs.
    def production_configs(env = {})
      raw = render_database_yml({ "DATABASE_URL" => PRIMARY_URL, "CACHE_DATABASE_URL" => nil }.merge(env))
      configs = ActiveRecord::DatabaseConfigurations.new("production" => raw["production"])
        .configs_for(env_name: "production")

      [ configs.find { |c| c.name == "primary" }, configs.find { |c| c.name == "cache" } ]
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
