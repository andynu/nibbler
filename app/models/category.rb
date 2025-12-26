class Category < ApplicationRecord
  belongs_to :user
  belongs_to :parent, class_name: "Category", optional: true
  has_many :children, class_name: "Category", foreign_key: :parent_id, dependent: :nullify
  has_many :feeds, dependent: :nullify

  validates :title, presence: true

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:order_id, :title) }
end
