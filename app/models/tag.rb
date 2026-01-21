# Represents a user-defined tag for classifying entries.
#
# Tags are user-scoped classification markers that can be applied to entries
# across any feed. They are linked directly to Entry records via the EntryTag
# join model.
#
# Tags support custom colors (foreground and background) for visual
# differentiation in the UI. They can be applied manually by users or
# automatically via filter actions.
#
# @see EntryTag for the join relationship
# @see Entry for tagged articles
# @see FilterAction for automated tagging
class Tag < ApplicationRecord
  belongs_to :user
  has_many :entry_tags, dependent: :destroy
  has_many :entries, through: :entry_tags
  has_many :feed_tags, dependent: :destroy
  has_many :feeds, through: :feed_tags

  validates :name, presence: true
  validates :name, uniqueness: { scope: :user_id }
end
