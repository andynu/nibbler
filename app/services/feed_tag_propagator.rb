# Propagates an entry tag to the feed level.
#
# When a user tags an entry, this service creates a FeedTag association
# and enqueues a background job to apply the tag to all matching entries
# in that feed.
class FeedTagPropagator
  # Propagate an entry tag to the feed level
  #
  # @param user_entry [UserEntry] the user entry being tagged
  # @param tag [Tag] the tag being applied
  def self.propagate(user_entry:, tag:)
    new(user_entry: user_entry, tag: tag).propagate
  end

  def initialize(user_entry:, tag:)
    @user_entry = user_entry
    @tag = tag
  end

  def propagate
    feed = @user_entry.feed
    return unless feed

    # Create feed-level tag association if not exists
    feed_tag = FeedTag.find_or_create_by!(feed: feed, tag: @tag)

    # Only enqueue batch apply if this is a new association
    if feed_tag.previously_new_record?
      ApplyFeedTagJob.perform_later(feed_id: feed.id, tag_id: @tag.id)
    end
  end
end
