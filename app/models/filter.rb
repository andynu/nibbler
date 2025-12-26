# Represents an automated rule for processing incoming articles.
#
# Filters allow users to define automated actions on new articles matching
# specified criteria. Each filter has one or more rules (conditions) and
# one or more actions (effects). Filters are evaluated in order_id sequence,
# and can be enabled/disabled.
#
# When a new article arrives, enabled filters are checked. If all rules match,
# the associated actions are executed (mark read, star, tag, delete, etc.).
#
# @see FilterRule for match conditions
# @see FilterAction for effects when rules match
# @see Entry for articles being filtered
class Filter < ApplicationRecord
  belongs_to :user
  has_many :filter_rules, dependent: :destroy
  has_many :filter_actions, dependent: :destroy

  accepts_nested_attributes_for :filter_rules, allow_destroy: true
  accepts_nested_attributes_for :filter_actions, allow_destroy: true

  scope :enabled, -> { where(enabled: true) }
  scope :ordered, -> { order(:order_id) }
end
