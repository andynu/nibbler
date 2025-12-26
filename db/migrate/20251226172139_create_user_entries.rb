class CreateUserEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :user_entries do |t|
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }
      t.string :uuid, null: false
      t.references :feed, foreign_key: { on_delete: :cascade }
      t.integer :orig_feed_id  # archived_feeds reference
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.boolean :marked, null: false, default: false  # starred
      t.boolean :published, null: false, default: false
      t.text :tag_cache, null: false, default: ""
      t.text :label_cache, null: false, default: ""
      t.datetime :last_read
      t.integer :score, null: false, default: 0
      t.datetime :last_marked
      t.datetime :last_published
      t.text :note
      t.boolean :unread, null: false, default: true
    end

    add_index :user_entries, :user_id
    add_index :user_entries, :entry_id
    add_index :user_entries, :feed_id
    add_index :user_entries, :unread
  end
end
