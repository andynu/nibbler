class RemoveFaviconAvgColorFromFeeds < ActiveRecord::Migration[8.1]
  def change
    remove_column :feeds, :favicon_avg_color, :string
  end
end
