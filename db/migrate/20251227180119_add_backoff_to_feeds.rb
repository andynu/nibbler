class AddBackoffToFeeds < ActiveRecord::Migration[8.1]
  def change
    add_column :feeds, :retry_after, :datetime
    add_column :feeds, :consecutive_failures, :integer, default: 0, null: false
  end
end
