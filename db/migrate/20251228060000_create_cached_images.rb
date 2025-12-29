# Stores metadata for cached article images
# Actual image files are stored on disk in public/images/cache/
class CreateCachedImages < ActiveRecord::Migration[8.1]
  def change
    create_table :cached_images do |t|
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }
      t.text :original_url, null: false
      t.string :cached_filename, null: false
      t.string :content_type, null: false, default: ""
      t.integer :file_size, null: false, default: 0
      t.datetime :cached_at, null: false

      t.index [ :entry_id, :original_url ], unique: true
    end
  end
end
