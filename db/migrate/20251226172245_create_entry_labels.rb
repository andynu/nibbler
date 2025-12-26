class CreateEntryLabels < ActiveRecord::Migration[8.1]
  def change
    create_table :entry_labels do |t|
      t.references :label, null: false, foreign_key: { on_delete: :cascade }
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }
    end

    add_index :entry_labels, :entry_id
    add_index :entry_labels, :label_id
  end
end
