class RemoveEmailDigestFromUsers < ActiveRecord::Migration[8.1]
  def change
    remove_column :users, :email_digest, :boolean, default: false, null: false
  end
end
