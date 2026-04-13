class CreateStories < ActiveRecord::Migration[8.1]
  def change
    create_table :stories do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.jsonb :queries, null: false, default: []
      t.text :summary
      t.string :status, null: false, default: "active"
      t.references :source_entry,
        foreign_key: { to_table: :entries, on_delete: :nullify },
        null: true
      t.datetime :concluded_at
      t.datetime :created_at, null: false
    end

    add_index :stories, :status
  end
end
