# Represents a folder for organizing feeds.
#
# Categories provide hierarchical organization of feed subscriptions. Each user
# has their own set of categories, and categories can be nested via parent/children
# relationships. Feeds are optionally assigned to a category.
#
# When a category is deleted, its child categories and feeds are orphaned (nullified)
# rather than deleted, preserving the underlying data.
#
# @see Feed for subscriptions within this category
# @see User for the owner of this category
class Category < ApplicationRecord
  belongs_to :user
  belongs_to :parent, class_name: "Category", optional: true
  has_many :children, class_name: "Category", foreign_key: :parent_id, dependent: :nullify
  has_many :feeds, dependent: :nullify

  validates :title, presence: true
  validate :parent_is_not_self_or_descendant

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:order_id, :title) }

  # Returns array of all descendant category IDs (recursive children).
  #
  # The visited set is not redundant with the parent validation: rows written
  # before that validation existed can still hold a cycle, and this is the walk
  # the validation itself runs.
  def descendant_ids
    ids = []
    seen = Set.new([ id ])
    queue = children.to_a

    while (child = queue.shift)
      next unless seen.add?(child.id)
      ids << child.id
      queue.concat(child.children.to_a)
    end

    ids
  end

  # Returns this category's ID plus all descendant IDs
  def self_and_descendant_ids
    [ id ] + descendant_ids
  end

  private

  # A category parented to itself or to something below it makes a closed loop
  # with no root. Every walk over the tree then has to carry a visited set to
  # terminate, and the ones that do not (the path builder behind Move Feed and
  # Edit Feed) hang the browser.
  def parent_is_not_self_or_descendant
    return if parent_id.nil?

    if parent_id == id
      errors.add(:parent_id, "cannot be the category itself")
    elsif persisted? && descendant_ids.include?(parent_id)
      errors.add(:parent_id, "cannot be one of this category's own descendants")
    end
  end
end
