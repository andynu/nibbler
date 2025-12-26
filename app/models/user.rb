class User < ApplicationRecord
  has_many :categories, dependent: :destroy
  has_many :feeds, dependent: :destroy
  has_many :user_entries, dependent: :destroy
  has_many :entries, through: :user_entries
  has_many :labels, dependent: :destroy
  has_many :tags, dependent: :destroy
  has_many :filters, dependent: :destroy
  has_many :user_preferences, dependent: :destroy

  validates :login, presence: true, uniqueness: true
  validates :pwd_hash, presence: true

  ACCESS_LEVELS = {
    user: 0,
    admin: 10
  }.freeze

  def admin?
    access_level >= ACCESS_LEVELS[:admin]
  end
end
