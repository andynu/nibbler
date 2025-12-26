# Represents a user-defined label for classifying entries.
#
# Labels are user-scoped classification markers that can be applied to entries
# across any feed. Unlike tags (which are per-UserEntry), labels are shared
# across the user's entire entry collection and are linked directly to Entry
# records via the EntryLabel join model.
#
# Labels are typically used for broader categorization like "Important",
# "Read Later", or topic-based groupings.
#
# @see EntryLabel for the join relationship
# @see Entry for labeled articles
# @see Tag for per-UserEntry tagging (an alternative classification mechanism)
class Label < ApplicationRecord
  belongs_to :user
  has_many :entry_labels, dependent: :destroy
  has_many :entries, through: :entry_labels

  validates :caption, presence: true
end
