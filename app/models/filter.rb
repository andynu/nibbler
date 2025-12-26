class Filter < ApplicationRecord
  belongs_to :user
  has_many :filter_rules, dependent: :destroy
  has_many :filter_actions, dependent: :destroy

  scope :enabled, -> { where(enabled: true) }
  scope :ordered, -> { order(:order_id) }
end
