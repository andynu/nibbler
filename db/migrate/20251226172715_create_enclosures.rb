class CreateEnclosures < ActiveRecord::Migration[8.1]
  def change
    create_table :enclosures do |t|
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }
      t.text :content_url, null: false
      t.string :content_type, null: false
      t.text :title, null: false
      t.string :duration, null: false
      t.integer :width, null: false, default: 0
      t.integer :height, null: false, default: 0
    end

    # entry_id index created automatically by t.references
  end
end
