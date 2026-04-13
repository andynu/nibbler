# Background job to apply a tag to all matching entries in a feed.
#
# Scans all entries in a feed and creates EntryTag associations for
# entries that match the tag name via word boundary matching.
class ApplyFeedTagJob < ApplicationJob
  queue_as :default

  def perform(feed_id:, tag_id:)
    feed = Feed.find_by(id: feed_id)
    tag = Tag.find_by(id: tag_id)

    return unless feed && tag

    count = FeedTagApplier.apply(feed: feed, tag: tag)
    Rails.logger.info "Applied tag '#{tag.name}' to #{count} entries in feed '#{feed.title}'"
  end
end
