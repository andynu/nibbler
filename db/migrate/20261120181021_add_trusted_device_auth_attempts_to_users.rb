class AddTrustedDeviceAuthAttemptsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :trusted_failed_auth_attempts, :integer, default: 0, null: false
    add_column :users, :trusted_last_auth_attempt, :datetime
  end
end
