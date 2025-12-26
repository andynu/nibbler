# Represents a user-specific configuration setting.
#
# UserPreferences store key-value pairs for user settings such as UI preferences,
# default behaviors, and feature toggles. Each preference name is unique per user.
#
# @see User for the owner of these preferences
class UserPreference < ApplicationRecord
  belongs_to :user

  validates :pref_name, presence: true, uniqueness: { scope: :user_id }
  validates :value, presence: true
end
