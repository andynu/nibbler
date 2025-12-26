class CreateTags < ActiveRecord::Migration[8.1]
  def change
    create_table :tags do |t|
      t.string :tag_name, null: false
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.references :user_entry, null: false, foreign_key: { on_delete: :cascade }
    end

    add_index :tags, :user_id
    add_index :tags, :user_entry_id
  end
end
