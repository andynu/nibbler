namespace :e2e do
  desc "Load the deterministic Playwright fixture set into the current database"
  task seed: :environment do
    unless E2eDataset.enabled?
      abort "e2e:seed refuses to run without ALLOW_E2E_RESET=1 (it truncates every table). Use bin/e2e-server."
    end

    E2eDataset.reseed!

    puts "Seeded #{Feed.count} feeds, #{Entry.count} entries, " \
         "#{Category.count} categories and #{Tag.count} tags into " \
         "#{ActiveRecord::Base.connection_db_config.database}"
  end
end
