# Join model linking feeds to tags, from before tag rules.
#
# Nothing applies these any more: each was converted to a feed-scoped TagRule
# whose query is the tag's name (rake tag_rules:convert_feed_tags). The rows
# stay until the table is dropped.
#
# @see TagRule for what tags arriving entries now
class FeedTag < ApplicationRecord
  belongs_to :feed
  belongs_to :tag

  validates :feed_id, uniqueness: { scope: :tag_id }
end
