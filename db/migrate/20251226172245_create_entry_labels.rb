class CreateEntryLabels < ActiveRecord::Migration[8.1]
  def change
    create_table :entry_labels do |t|
      t.references :label, null: false, foreign_key: { on_delete: :cascade }
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }
    end

    # entry_id, label_id indexes created automatically by t.references
  end
end
