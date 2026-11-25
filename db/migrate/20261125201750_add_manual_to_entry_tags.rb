class AddManualToEntryTags < ActiveRecord::Migration[8.1]
  def change
    add_column :entry_tags, :manual, :boolean, default: true, null: false
  end
end
