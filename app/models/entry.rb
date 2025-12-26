class Entry < ApplicationRecord
  has_many :user_entries, dependent: :destroy
  has_many :users, through: :user_entries
  has_many :enclosures, dependent: :destroy
  has_many :entry_labels, dependent: :destroy
  has_many :labels, through: :entry_labels

  validates :guid, presence: true, uniqueness: true
  validates :title, presence: true
  validates :link, presence: true
  validates :content, presence: true
  validates :content_hash, presence: true

  scope :recent, -> { order(date_entered: :desc) }
end
