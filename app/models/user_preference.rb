class UserPreference < ApplicationRecord
  belongs_to :user

  validates :pref_name, presence: true, uniqueness: { scope: :user_id }
  validates :value, presence: true
end
