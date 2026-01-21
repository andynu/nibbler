# Removes a tag from all entries in a feed.
#
# Deletes all EntryTag associations for entries in a feed that have
# the specified tag. Used when removing a feed-level tag.
class FeedTagRemover
  # Remove a tag from all entries in a feed
  #
  # @param feed [Feed] the feed to scan
  # @param tag [Tag] the tag to remove
  # @return [Integer] count of entry tags deleted
  def self.remove(feed:, tag:)
    new(feed: feed, tag: tag).remove
  end

  def initialize(feed:, tag:)
    @feed = feed
    @tag = tag
  end

  def remove
    entry_ids = @feed.entries.pluck(:id)
    return 0 if entry_ids.empty?

    EntryTag.where(entry_id: entry_ids, tag: @tag).delete_all
  end
end
