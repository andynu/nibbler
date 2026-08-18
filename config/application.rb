require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
# require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"
# require "action_mailbox/engine"
# require "action_text/engine"
require "action_view/railtie"
# require "action_cable/engine"
require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Ttrb
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Don't generate system test files.
    config.generators.system_tests = nil

    # Text-to-speech shells out to the Python virtualenv described by
    # pyproject.toml. That venv is ~7G (forcealign pulls in torch and the CUDA
    # runtime), it is excluded from the Docker build context, and it cannot be
    # copied from a host because bin/python3 is an absolute symlink to the host
    # interpreter. Leave this unset to auto-detect a usable interpreter; set
    # TTS_ENABLED to force it on or off.
    config.x.tts.enabled = ActiveModel::Type::Boolean.new.cast(ENV["TTS_ENABLED"]) if ENV.key?("TTS_ENABLED")

    # On-disk homes for the article image cache and the generated TTS audio.
    # Both live under public/ so the static file server can serve them at
    # /images/cache and /audio/cache, and both are Kamal volumes so they
    # survive a deploy (config/deploy.yml). Settings rather than constants
    # because the test environment redirects them out of public/ and the
    # parallel test workers each need a directory of their own, so every reader
    # has to resolve the path at call time.
    config.x.image_cache.dir = Rails.root.join("public", "images", "cache")
    config.x.audio_cache.dir = Rails.root.join("public", "audio", "cache")
  end
end
