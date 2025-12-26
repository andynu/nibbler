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

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:order_id, :title) }
end
