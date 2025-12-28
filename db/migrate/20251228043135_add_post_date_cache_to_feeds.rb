class AddPostDateCacheToFeeds < ActiveRecord::Migration[8.1]
  def change
    add_column :feeds, :oldest_entry_date, :datetime
    add_column :feeds, :newest_entry_date, :datetime
    add_column :feeds, :entry_count, :integer, default: 0, null: false
  end
end
