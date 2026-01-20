class AddCompositeIndexToUserEntriesOnUserIdAndUnread < ActiveRecord::Migration[8.1]
  def change
    add_index :user_entries, [ :user_id, :unread ]
  end
end
