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

  # Authenticate with username and password
  def self.authenticate(login, password)
    user = find_by(login: login)
    return nil unless user
    return nil unless user.authenticate_password(password)
    user
  end

  # Check if password matches stored hash
  def authenticate_password(password)
    if salt.present?
      # TTRSS-style with salt
      computed_hash = Digest::SHA256.hexdigest(salt + password)
      pwd_hash == computed_hash
    else
      # Simple SHA256 (fallback)
      computed_hash = Digest::SHA256.hexdigest(password)
      pwd_hash == computed_hash
    end
  end

  # Set a new password
  def password=(new_password)
    self.salt = SecureRandom.hex(16)
    self.pwd_hash = Digest::SHA256.hexdigest(salt + new_password)
  end
end
