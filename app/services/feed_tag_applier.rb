# Applies a tag to all matching entries in a feed.
#
# Scans all entries in a feed and creates EntryTag associations for
# entries whose title or content matches the tag name (via word boundary
# matching).
class FeedTagApplier
  # Apply a tag to all matching entries in a feed
  #
  # @param feed [Feed] the feed to scan
  # @param tag [Tag] the tag to apply
  # @return [Integer] count of entries tagged
  def self.apply(feed:, tag:)
    new(feed: feed, tag: tag).apply
  end

  def initialize(feed:, tag:)
    @feed = feed
    @tag = tag
  end

  def apply
    count = 0

    @feed.entries.find_each do |entry|
      next unless TagMatcher.matches?(entry, @tag.name)

      # Skip if already tagged
      next if EntryTag.exists?(entry: entry, tag: @tag)

      EntryTag.create!(entry: entry, tag: @tag)
      count += 1
    end

    count
  end
end
