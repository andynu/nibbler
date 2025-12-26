class Label < ApplicationRecord
  belongs_to :user
  has_many :entry_labels, dependent: :destroy
  has_many :entries, through: :entry_labels

  validates :caption, presence: true
end
