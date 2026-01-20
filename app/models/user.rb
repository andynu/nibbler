# Represents an account holder in the feed reader system.
#
# Users are the central entity that owns all user-specific data: feed subscriptions,
# categories for organizing feeds, entries they've received, tags for classification,
# filters for automated article processing, and preferences.
#
# Authentication uses bcrypt via has_secure_password for secure password storage.
# Access levels support basic user vs admin role differentiation.
#
# @see Feed for subscribed RSS/Atom feeds
# @see Category for feed organization
# @see Filter for automated article processing rules
class User < ApplicationRecord
  has_secure_password

  has_many :categories, dependent: :destroy
  has_many :feeds, dependent: :destroy
  has_many :user_entries, dependent: :destroy
  has_many :entries, through: :user_entries
  has_many :tags, dependent: :destroy
  has_many :filters, dependent: :destroy
  has_many :user_preferences, dependent: :destroy

  validates :login, presence: true, uniqueness: true

  ACCESS_LEVELS = {
    user: 0,
    admin: 10
  }.freeze

  def admin?
    access_level >= ACCESS_LEVELS[:admin]
  end

  # Authenticate with username and password
  # Supports migration from legacy SHA256 passwords to bcrypt
  def self.authenticate(login, password)
    user = find_by(login: login)
    return nil unless user

    # Try bcrypt authentication first (via has_secure_password)
    if user.password_digest.present?
      return user if user.authenticate(password)
      return nil
    end

    # Fall back to legacy SHA256 authentication for migration
    return nil unless user.authenticate_legacy_password(password)

    # Migrate to bcrypt on successful legacy authentication
    user.update!(password: password)
    user
  end

  # Check if password matches legacy SHA256 hash (for migration support)
  def authenticate_legacy_password(password)
    return false if pwd_hash.blank?

    computed_hash = if salt.present?
      Digest::SHA256.hexdigest(salt + password)
    else
      Digest::SHA256.hexdigest(password)
    end
    pwd_hash == computed_hash
  end

  # Generate a new access key for the public published feed
  def regenerate_access_key!
    update!(access_key: SecureRandom.urlsafe_base64(32))
  end

  # Get or create access key for public feed
  def ensure_access_key!
    regenerate_access_key! if access_key.blank?
    access_key
  end
end
