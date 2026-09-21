class AddFailedAuthAttemptsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :failed_auth_attempts, :integer, default: 0, null: false
  end
end
