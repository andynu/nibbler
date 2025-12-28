namespace :feeds do
  desc "Import feeds from OPML file"
  task :import_opml, [ :file, :user_login ] => :environment do |_t, args|
    file_path = args[:file]
    user_login = args[:user_login] || "admin"

    unless file_path && File.exist?(file_path)
      puts "Usage: rake feeds:import_opml[path/to/file.opml,username]"
      puts "Error: File not found: #{file_path}"
      exit 1
    end

    user = User.find_by(login: user_login)
    unless user
      puts "Error: User '#{user_login}' not found"
      puts "Available users: #{User.pluck(:login).join(', ')}"
      exit 1
    end

    opml_content = File.read(file_path)
    result = OpmlImporter.new(user, opml_content).import

    if result.success?
      puts "Import successful!"
      puts result.summary
    else
      puts "Import completed with errors:"
      result.errors.each { |e| puts "  - #{e}" }
      puts result.summary
    end
  end

  desc "Update a single feed"
  task :update, [ :feed_id ] => :environment do |_t, args|
    feed = Feed.find(args[:feed_id])
    puts "Updating feed: #{feed.title} (#{feed.feed_url})"

    result = FeedUpdater.new(feed).update

    if result.success?
      puts "Success! Status: #{result.status}, New entries: #{result.new_entries_count}"
    else
      puts "Error: #{result.error}"
    end
  end

  desc "Update all feeds for a user"
  task :update_all, [ :user_login ] => :environment do |_t, args|
    user_login = args[:user_login] || "admin"
    user = User.find_by!(login: user_login)

    feeds = user.feeds.where("last_updated IS NULL OR last_updated < ?", 5.minutes.ago)
    puts "Updating #{feeds.count} feeds for user #{user_login}..."

    total_new = 0
    feeds.find_each do |feed|
      print "  #{feed.title}... "
      result = FeedUpdater.new(feed).update

      if result.success?
        puts "#{result.status} (+#{result.new_entries_count})"
        total_new += result.new_entries_count
      else
        puts "ERROR: #{result.error}"
      end
    end

    puts "Done! #{total_new} new entries total."
  end

  desc "List feeds for a user"
  task :list, [ :user_login ] => :environment do |_t, args|
    user_login = args[:user_login] || "admin"
    user = User.find_by!(login: user_login)

    puts "Feeds for #{user_login}:"
    user.feeds.includes(:category).ordered.each do |feed|
      category = feed.category&.title || "(uncategorized)"
      unread = feed.user_entries.unread.count
      puts "  [#{feed.id}] #{category} / #{feed.title} - #{unread} unread"
    end
  end

  desc "Export feeds to OPML"
  task :export_opml, [ :user_login, :output_file ] => :environment do |_t, args|
    user_login = args[:user_login] || "admin"
    output_file = args[:output_file]

    user = User.find_by!(login: user_login)
    opml = OpmlExporter.new(user).export

    if output_file
      File.write(output_file, opml)
      puts "Exported #{user.feeds.count} feeds to #{output_file}"
    else
      puts opml
    end
  end

  desc "Clear the feed cache (dev only)"
  task clear_cache: :environment do
    CachedFeedFetcher.clear_cache!
  end

  desc "Seed test feeds from public/test_feeds"
  task seed_test_feeds: :environment do
    user = User.find_by(login: "admin")
    unless user
      puts "Creating admin user..."
      user = User.create!(
        login: "admin",
        email: "admin@example.com",
        full_name: "Administrator",
        access_level: 10,
        pwd_hash: BCrypt::Password.create("admin")
      )
    end

    base_url = ENV.fetch("TEST_FEED_BASE_URL", "http://localhost:3000")

    test_feeds = [
      {
        category: "Technology",
        feeds: [
          { title: "Tech Insights Blog", file: "tech_blog.xml" }
        ]
      },
      {
        category: "Science",
        feeds: [
          { title: "Science Daily Digest", file: "science_daily.xml" }
        ]
      },
      {
        category: "News",
        feeds: [
          { title: "World News Roundup", file: "world_news.xml" }
        ]
      },
      {
        category: "Lifestyle",
        feeds: [
          { title: "Home Kitchen Adventures", file: "cooking_recipes.xml" }
        ]
      }
    ]

    puts "Seeding test feeds for user: #{user.login}"

    test_feeds.each do |group|
      category = user.categories.find_or_create_by!(title: group[:category])
      puts "  Category: #{category.title}"

      group[:feeds].each do |feed_data|
        feed_url = "#{base_url}/test_feeds/#{feed_data[:file]}"
        feed = user.feeds.find_or_initialize_by(feed_url: feed_url)
        feed.title = feed_data[:title]
        feed.category = category
        feed.save!
        puts "    Feed: #{feed.title} (#{feed_url})"
      end
    end

    puts "\nDone! Now run: rake feeds:update_all to fetch entries"
  end

  desc "Show feed update stats"
  task stats: :environment do
    puts "Feed Statistics:"
    puts "  Total feeds: #{Feed.count}"
    puts "  Total entries: #{Entry.count}"
    puts "  Total user entries: #{UserEntry.count}"
    puts "  Unread entries: #{UserEntry.unread.count}"
    puts ""
    puts "  Feeds never updated: #{Feed.where(last_updated: nil).count}"
    puts "  Feeds with errors: #{Feed.where.not(last_error: '').count}"
    puts "  Feeds updated in last hour: #{Feed.where('last_updated > ?', 1.hour.ago).count}"
  end
end
