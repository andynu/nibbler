# Applies feed-level tags to a newly created entry.
#
# When a new entry arrives in a feed, this service checks if any of
# the feed's tags match the entry content and applies matching tags
# to the entry.
class FeedTagsForEntryApplier
  # Apply matching feed tags to an entry
  #
  # @param user_entry [UserEntry] the newly created user entry
  # @return [Integer] count of tags applied
  def self.apply(user_entry:)
    new(user_entry: user_entry).apply
  end

  def initialize(user_entry:)
    @user_entry = user_entry
  end

  def apply
    feed = @user_entry.feed
    return 0 unless feed

    entry = @user_entry.entry
    count = 0

    feed.tags.find_each do |tag|
      next unless TagMatcher.matches?(entry, tag.name)

      # Skip if already tagged
      next if EntryTag.exists?(entry: entry, tag: tag)

      EntryTag.create!(entry: entry, tag: tag)
      count += 1
    end

    count
  end
end
