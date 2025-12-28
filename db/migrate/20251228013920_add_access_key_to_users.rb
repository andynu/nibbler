class AddAccessKeyToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :access_key, :string
    add_index :users, :access_key, unique: true
  end
end
