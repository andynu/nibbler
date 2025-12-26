class Filter < ApplicationRecord
  belongs_to :user
  has_many :filter_rules, dependent: :destroy
  has_many :filter_actions, dependent: :destroy

  accepts_nested_attributes_for :filter_rules, allow_destroy: true
  accepts_nested_attributes_for :filter_actions, allow_destroy: true

  scope :enabled, -> { where(enabled: true) }
  scope :ordered, -> { order(:order_id) }
end
