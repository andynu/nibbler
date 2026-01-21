# Background job to remove a tag from all entries in a feed.
#
# Deletes all EntryTag associations for entries in a feed that have
# the specified tag.
class RemoveFeedTagJob < ApplicationJob
  queue_as :default

  def perform(feed_id:, tag_id:)
    feed = Feed.find_by(id: feed_id)
    tag = Tag.find_by(id: tag_id)

    return unless feed && tag

    count = FeedTagRemover.remove(feed: feed, tag: tag)
    Rails.logger.info "Removed tag '#{tag.name}' from #{count} entries in feed '#{feed.title}'"
  end
end
