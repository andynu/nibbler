# Represents a user-applied tag on a specific entry instance.
#
# Tags are lightweight, user-scoped keywords attached to UserEntry records.
# Unlike Labels (which link directly to Entry), tags are specific to how a
# particular user has categorized a particular entry in their collection.
#
# Tags can be applied manually by users or automatically via filter actions.
#
# @see UserEntry for the tagged entry instance
# @see Label for an alternative classification mechanism at the Entry level
# @see FilterAction for automated tagging
class Tag < ApplicationRecord
  belongs_to :user
  belongs_to :user_entry

  validates :tag_name, presence: true
end
