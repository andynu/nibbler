class CreateCachedAudios < ActiveRecord::Migration[8.1]
  def change
    create_table :cached_audios do |t|
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.string :audio_filename, null: false
      t.string :content_hash, null: false
      t.float :duration, null: false
      t.json :timestamps, null: false
      t.datetime :cached_at, null: false
    end

    add_index :cached_audios, :entry_id, unique: true
    add_index :cached_audios, :content_hash
  end
end
