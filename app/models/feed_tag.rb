# Join model linking feeds to tags for automatic entry tagging.
#
# When a tag is associated with a feed via FeedTag, entries from that feed
# that match the tag name (via word boundary matching) receive the tag
# automatically. New entries are checked on arrival.
#
# @see Feed for the subscription
# @see Tag for the applied classification
# @see TagMatcher for the matching logic
class FeedTag < ApplicationRecord
  belongs_to :feed
  belongs_to :tag

  validates :feed_id, uniqueness: { scope: :tag_id }
end
