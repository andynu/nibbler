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

  ACTION_TYPES = %w[delete mark_read star tag publish score label stop plugin ignore_tag].freeze

  validates :action_type, presence: true, inclusion: { in: ACTION_TYPES }
end
