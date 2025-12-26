# Represents an action to perform when a filter's rules match.
#
# FilterActions define what happens to articles matching a filter. Available
# actions include: delete, mark as read, star, apply tag, publish, adjust
# score, apply label, stop processing further filters, run plugin, or
# ignore specific tags.
#
# Multiple actions can be attached to a single filter, all of which execute
# when the filter matches.
#
# @see Filter for the parent automation rule
# @see FilterRule for the matching conditions
class FilterAction < ApplicationRecord
  belongs_to :filter

  ACTION_TYPES = {
    delete: 1,
    mark_read: 2,
    star: 3,
    tag: 4,
    publish: 5,
    score: 6,
    label: 7,
    stop: 8,
    plugin: 9,
    ignore_tag: 10
  }.freeze

  validates :action_type, presence: true, inclusion: { in: ACTION_TYPES.values }
end
