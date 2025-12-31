class RemoveTagAndLabelCachesFromUserEntries < ActiveRecord::Migration[8.1]
  def change
    remove_column :user_entries, :tag_cache, :text
    remove_column :user_entries, :label_cache, :text
  end
end
