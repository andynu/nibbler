class CreateEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :entries do |t|
      t.text :title, null: false
      t.text :guid, null: false
      t.text :link, null: false
      t.datetime :updated, null: false
      t.text :content, null: false
      t.string :content_hash, null: false
      t.text :cached_content
      t.boolean :no_orig_date, null: false, default: false
      t.datetime :date_entered, null: false
      t.datetime :date_updated, null: false
      t.integer :num_comments, null: false, default: 0
      t.string :comments, null: false, default: ""
      t.text :plugin_data
      t.string :lang, limit: 2
      t.string :author, null: false, default: ""
    end

    add_index :entries, :guid, unique: true
    add_index :entries, :date_entered
    add_index :entries, :updated

    # Full-text search support (PostgreSQL)
    execute <<-SQL
      ALTER TABLE entries ADD COLUMN tsvector_combined tsvector;
      CREATE INDEX entries_tsvector_combined_idx ON entries USING gin(tsvector_combined);
    SQL
  end
end
