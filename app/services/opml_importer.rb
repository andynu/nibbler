# Imports feeds from OPML format
# OPML is the standard format for exporting/importing feed subscriptions
class OpmlImporter
  ImportedFeed = Data.define(:title, :feed_url, :site_url, :category_path)

  class ImportResult
    attr_reader :feeds, :categories_created, :feeds_created, :feeds_skipped, :errors

    def initialize
      @feeds = []
      @categories_created = 0
      @feeds_created = 0
      @feeds_skipped = 0
      @errors = []
    end

    def add_feed(feed)
      @feeds << feed
    end

    def increment_categories
      @categories_created += 1
    end

    def increment_created
      @feeds_created += 1
    end

    def increment_skipped
      @feeds_skipped += 1
    end

    def add_error(message)
      @errors << message
    end

    def success?
      @errors.empty?
    end

    def summary
      "Created #{@feeds_created} feeds, skipped #{@feeds_skipped} duplicates, " \
        "created #{@categories_created} categories"
    end
  end

  def initialize(user, opml_content)
    @user = user
    @opml_content = opml_content
    @category_cache = {}
  end

  def import
    result = ImportResult.new

    doc = Nokogiri::XML(@opml_content)
    body = doc.at_xpath("//body")

    if body.nil?
      result.add_error("Invalid OPML: no body element found")
      return result
    end

    # Process top-level outlines
    body.xpath("./outline").each do |outline|
      process_outline(outline, [], result)
    end

    result
  rescue Nokogiri::XML::SyntaxError => e
    result = ImportResult.new
    result.add_error("Invalid XML: #{e.message}")
    result
  end

  private

  def process_outline(outline, category_path, result)
    # Check if this is a feed or a category
    xml_url = outline["xmlUrl"]

    if xml_url.present?
      # This is a feed
      import_feed(outline, category_path, result)
    else
      # This is a category - recurse into children
      category_name = outline["title"] || outline["text"] || "Unnamed"
      new_path = category_path + [category_name]

      outline.xpath("./outline").each do |child|
        process_outline(child, new_path, result)
      end
    end
  end

  def import_feed(outline, category_path, result)
    feed_url = outline["xmlUrl"]
    title = outline["title"] || outline["text"] || feed_url
    site_url = outline["htmlUrl"] || ""

    # Record parsed feed
    result.add_feed(ImportedFeed.new(
      title: title,
      feed_url: feed_url,
      site_url: site_url,
      category_path: category_path
    ))

    # Check for duplicate
    if @user.feeds.exists?(feed_url: feed_url)
      result.increment_skipped
      return
    end

    # Find or create category
    category = find_or_create_category(category_path, result)

    # Create feed
    @user.feeds.create!(
      title: title,
      feed_url: feed_url,
      site_url: site_url,
      category: category
    )
    result.increment_created
  rescue ActiveRecord::RecordInvalid => e
    result.add_error("Failed to import '#{title}': #{e.message}")
  end

  def find_or_create_category(path, result)
    return nil if path.empty?

    cache_key = path.join("/")
    return @category_cache[cache_key] if @category_cache.key?(cache_key)

    parent = nil
    current_path = []

    path.each do |name|
      current_path << name
      cache_key = current_path.join("/")

      if @category_cache.key?(cache_key)
        parent = @category_cache[cache_key]
      else
        category = @user.categories.find_or_create_by!(title: name, parent: parent)
        if category.previously_new_record?
          result.increment_categories
        end
        @category_cache[cache_key] = category
        parent = category
      end
    end

    parent
  end
end
