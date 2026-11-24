class AddArticleMetricsToEntries < ActiveRecord::Migration[8.1]
  def change
    add_column :entries, :word_count, :integer
    add_column :entries, :link_density, :float
  end
end
