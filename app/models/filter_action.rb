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
