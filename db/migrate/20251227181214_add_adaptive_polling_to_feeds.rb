class AddAdaptivePollingToFeeds < ActiveRecord::Migration[8.0]
  def change
    add_column :feeds, :avg_posts_per_day, :float, default: 0.0, null: false
    add_column :feeds, :last_new_entry_at, :datetime
    add_column :feeds, :calculated_interval_seconds, :integer
    add_column :feeds, :next_poll_at, :datetime

    add_index :feeds, :next_poll_at
  end
end
