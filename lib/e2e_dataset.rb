# Deterministic dataset for the Playwright end-to-end suite.
#
# The suite drives a real server and mutates as it goes (mark all read,
# star/unstar, create and delete tags, categories and feeds), so each example
# starts by POSTing to /e2e/reset, which lands here. Truncating with RESTART
# IDENTITY means record ids are the same on every reset; entry timestamps are
# relative to Time.current so seeded articles always fall inside the 24 hour
# "Fresh" window no matter when the suite runs.
#
# Only reachable from a server booted by bin/e2e-server, which sets
# ALLOW_E2E_RESET=1. reseed! re-checks that flag itself, so the class is inert
# in development and production even if something calls it directly.
class E2eDataset
  class NotEnabledError < StandardError; end

  # Left alone by the truncate so the connection keeps its schema bookkeeping.
  PRESERVED_TABLES = %w[ar_internal_metadata schema_migrations].freeze

  ADMIN_LOGIN = "admin".freeze
  ADMIN_PASSWORD = "password".freeze

  CATEGORIES = [
    { key: :technology, title: "Technology", order_id: 0, parent: nil },
    { key: :programming, title: "Programming", order_id: 1, parent: :technology },
    { key: :science, title: "Science", order_id: 2, parent: nil }
  ].freeze

  FEEDS = [
    { key: :rust, title: "Rust Weekly", slug: "rust-weekly", category: :programming, order_id: 0 },
    { key: :ruby, title: "Ruby Dispatch", slug: "ruby-dispatch", category: :programming, order_id: 1 },
    { key: :space, title: "Deep Space", slug: "deep-space", category: :science, order_id: 2 },
    { key: :notes, title: "Field Notes", slug: "field-notes", category: nil, order_id: 3 }
  ].freeze

  TAGS = [
    { name: "rust", fg_color: "#ffffff", bg_color: "#b7410e" },
    { name: "release", fg_color: "#ffffff", bg_color: "#2563eb" },
    { name: "astronomy", fg_color: "#0f172a", bg_color: "#fbbf24" }
  ].freeze

  # Headlines per feed. Order matters: the read/starred pattern below is keyed
  # off the index, so changing this list changes the fixture states too.
  HEADLINES = {
    rust: [
      "Rust 1.90 stabilises const generics",
      "A tour of the borrow checker",
      "Writing a parser with nom",
      "Cargo workspaces in large repos",
      "Async runtimes compared",
      "Embedded Rust on the RP2040"
    ],
    ruby: [
      "Ruby 4.0 release candidate is out",
      "Pattern matching beyond the basics",
      "Profiling Rails with Vernier",
      "Frozen string literals by default",
      "Building gems with Zeitwerk",
      "YJIT in production"
    ],
    space: [
      "Webb telescope images a rocky exoplanet",
      "Mapping the heliopause",
      "A new estimate for the Hubble constant",
      "Europa Clipper enters cruise phase",
      "Radio bursts from the galactic centre",
      "Cataloguing trans-Neptunian objects"
    ],
    notes: [
      "Notes on tidal marsh sediment",
      "Bird counts for the spring survey",
      "Rewriting the field log format",
      "Lichen coverage after the burn",
      "Soil pH along the ridge line",
      "Weather station calibration"
    ]
  }.freeze

  # Article index -> per-user state. Every feed gets the same shape so specs can
  # count on at least one unread, one read and one starred article per feed.
  READ_INDEXES = [ 4, 5 ].freeze
  STARRED_INDEXES = [ 1 ].freeze

  # The one article that ships with a summary already written.
  #
  # Seeded articles are a few hundred characters, well under
  # EntrySummarizer::MIN_CONTENT_CHARS, so every one of them is unsummarizable
  # and the reading pane says the feed publishes an excerpt only. That is half
  # of what the summary spec checks; this row is what lets it also check the
  # paragraph, the provenance line and the control that puts them away, with no
  # model involved.
  SUMMARIZED_HEADLINE = "Rust 1.90 stabilises const generics".freeze

  SUMMARY_PARAGRAPH = (
    "The release promotes const generics to stable after four years behind a " \
    "feature gate, which lets array lengths and similar compile-time values be " \
    "parameters rather than macros. Nothing else in the release notes changes " \
    "existing code."
  ).freeze

  SUMMARY_MODEL = "gemma4:e4b".freeze

  class << self
    def enabled?
      ENV["ALLOW_E2E_RESET"] == "1"
    end

    # Wipe every application table and rebuild the fixture set.
    def reseed!
      unless enabled?
        raise NotEnabledError, "E2eDataset requires the server to be booted with ALLOW_E2E_RESET=1"
      end

      ActiveRecord::Base.transaction do
        truncate_all!
        new.build!
      end
    end

    # Brakeman flags the interpolated table list as possible SQL injection; the
    # rationale for ignoring it is recorded in config/brakeman.ignore. Short
    # version: the names come from the connection's own catalog and each is
    # quoted, and connection.truncate_tables is not a substitute because it
    # emits no RESTART IDENTITY.
    def truncate_all!
      tables = ActiveRecord::Base.connection.tables - PRESERVED_TABLES
      return if tables.empty?

      quoted = tables.map { |t| ActiveRecord::Base.connection.quote_table_name(t) }.join(", ")
      ActiveRecord::Base.connection.execute("TRUNCATE TABLE #{quoted} RESTART IDENTITY CASCADE")
    end
  end

  def build!
    @now = Time.current
    @user = create_user
    @categories = create_categories
    @feeds = create_feeds
    @tags = create_tags
    create_entries
    create_summary
    create_filter
    @user
  end

  private

  def create_user
    User.create!(
      login: ADMIN_LOGIN,
      password: ADMIN_PASSWORD,
      email: "admin@example.com",
      full_name: "E2E Admin",
      access_level: User::ACCESS_LEVELS[:admin],
      access_key: "e2e-public-feed-access-key"
    )
  end

  def create_categories
    CATEGORIES.each_with_object({}) do |attrs, built|
      built[attrs[:key]] = @user.categories.create!(
        title: attrs[:title],
        order_id: attrs[:order_id],
        parent: attrs[:parent] && built.fetch(attrs[:parent])
      )
    end
  end

  def create_feeds
    FEEDS.each_with_object({}) do |attrs, built|
      built[attrs[:key]] = @user.feeds.create!(
        title: attrs[:title],
        # .invalid never resolves (RFC 2606). Nothing should reach these URLs:
        # OFFLINE_FEED_FETCH short-circuits every fetch, and the URLs being
        # unroutable is the backstop if that switch is ever missed.
        feed_url: "https://e2e.invalid/#{attrs[:slug]}.xml",
        site_url: "https://e2e.invalid/#{attrs[:slug]}",
        # Deliberately blank so the browser never requests an external favicon.
        icon_url: "",
        category: attrs[:category] && @categories.fetch(attrs[:category]),
        order_id: attrs[:order_id],
        last_updated: @now - 30.minutes,
        last_successful_update: @now - 30.minutes
      )
    end
  end

  def create_tags
    TAGS.each_with_object({}) do |attrs, built|
      built[attrs[:name]] = @user.tags.create!(**attrs)
    end
  end

  def create_entries
    FEEDS.each_with_index do |feed_attrs, feed_index|
      feed = @feeds.fetch(feed_attrs[:key])

      HEADLINES.fetch(feed_attrs[:key]).each_with_index do |title, index|
        # Spread articles over the last 14 hours so all of them stay inside the
        # default 24 hour Fresh window while still sorting in a stable order.
        published = @now - ((index * 2) + feed_index).hours
        entry = create_entry(feed_attrs, title, index, published)

        UserEntry.create!(
          user: @user,
          entry: entry,
          feed: feed,
          uuid: "e2e-#{feed_attrs[:slug]}-#{index}",
          unread: !READ_INDEXES.include?(index),
          marked: STARRED_INDEXES.include?(index),
          last_read: READ_INDEXES.include?(index) ? published + 1.hour : nil,
          last_marked: STARRED_INDEXES.include?(index) ? published + 1.hour : nil
        )
      end

      feed.refresh_entry_stats!
    end

    tag_entries
  end

  # content_hash has to be the digest FeedUpdater would have written for this
  # text, not merely some digest of it: EntrySummary#valid_for_content? compares
  # a summary's stored hash against Entry#content_hash, so a seeder using its own
  # algorithm makes every summary of a seeded article read back stale. Pinned by
  # test/lib/e2e_dataset_test.rb, which runs the same text through both writers.
  def create_entry(feed_attrs, title, index, published)
    content = <<~HTML.strip
      <p>#{title}. Seeded article #{index + 1} from #{feed_attrs[:title]}, used by the
      end-to-end suite. It carries enough prose for the reading pane, keyword
      extraction and full-text search to have something to work with.</p>
      <p>No external assets are referenced here, so rendering this article never
      leaves the machine running the tests.</p>
    HTML

    Entry.create!(
      title: title,
      link: "https://e2e.invalid/#{feed_attrs[:slug]}/#{index}",
      guid: "e2e:#{feed_attrs[:slug]}:#{index}",
      author: "#{feed_attrs[:title]} Staff",
      content: content,
      content_hash: Digest::SHA256.hexdigest(content),
      updated: published,
      date_entered: published,
      date_updated: published,
      lang: "en"
    )
  end

  # One article that already has a summary, so the browser suite can open a
  # summarized article and see the paragraph without a model anywhere near it.
  #
  # content_hash matches the entry's, so the summary reads as current rather
  # than stale. Exactly one row, on the first Rust article, and no counts move.
  def create_summary
    entry = Entry.find_by!(title: SUMMARIZED_HEADLINE)

    EntrySummary.create!(
      entry: entry,
      summary: SUMMARY_PARAGRAPH,
      model: SUMMARY_MODEL,
      content_hash: entry.content_hash,
      generated_at: @now - 20.minutes
    )
  end

  # A handful of tagged articles so the tag sidebar and tag filtering have data
  # without every article carrying a tag.
  def tag_entries
    tag_first_entries(:rust, "rust", 3)
    tag_first_entries(:rust, "release", 1)
    tag_first_entries(:space, "astronomy", 2)
  end

  def tag_first_entries(feed_key, tag_name, count)
    tag = @tags.fetch(tag_name)
    entry_ids = @feeds.fetch(feed_key).user_entries.order(:id).limit(count).pluck(:entry_id)

    entry_ids.each { |entry_id| EntryTag.create!(entry_id: entry_id, tag: tag) }
  end

  def create_filter
    filter = @user.filters.create!(title: "Star Rust releases", order_id: 0, enabled: true)
    filter.filter_rules.create!(filter_type: "title", reg_exp: "release", inverse: false)
    filter.filter_actions.create!(action_type: "star", action_param: "")
    filter
  end
end
