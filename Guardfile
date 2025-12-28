# Auto-run Rails tests on file changes
# Start with: bundle exec guard

guard :minitest, spring: false, all_on_start: false do
  # Watch test files directly
  watch(%r{^test/(.*)_test\.rb$})

  # Watch test helper - run all tests
  watch(%r{^test/test_helper\.rb$}) { "test" }

  # Watch lib files
  watch(%r{^lib/(.*/)?([^/]+)\.rb$}) { |m| "test/lib/#{m[1]}#{m[2]}_test.rb" }

  # Rails models -> model tests
  watch(%r{^app/models/(.+)\.rb$}) { |m| "test/models/#{m[1]}_test.rb" }

  # Rails controllers -> controller tests
  watch(%r{^app/controllers/(.+)\.rb$}) { |m| "test/controllers/#{m[1]}_test.rb" }

  # Rails services -> service tests
  watch(%r{^app/services/(.+)\.rb$}) { |m| "test/services/#{m[1]}_test.rb" }

  # Rails jobs -> job tests
  watch(%r{^app/jobs/(.+)\.rb$}) { |m| "test/jobs/#{m[1]}_test.rb" }

  # Rails mailers -> mailer tests
  watch(%r{^app/mailers/(.+)\.rb$}) { |m| "test/mailers/#{m[1]}_test.rb" }

  # Application controller changes -> run all controller tests
  watch(%r{^app/controllers/application_controller\.rb$}) { "test/controllers" }
end
