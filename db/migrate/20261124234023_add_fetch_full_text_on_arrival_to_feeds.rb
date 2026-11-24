class AddFetchFullTextOnArrivalToFeeds < ActiveRecord::Migration[8.1]
  def change
    add_column :feeds, :fetch_full_text_on_arrival, :boolean, default: false, null: false
  end
end
