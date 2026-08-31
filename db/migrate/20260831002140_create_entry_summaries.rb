class CreateEntrySummaries < ActiveRecord::Migration[8.1]
  def change
    # A table of its own rather than columns on entries. entries is the most
    # queried table in the app and is already wide; a summary exists for a small
    # minority of rows, so a nullable text column there would be read past on
    # every entry query to serve almost none of them.
    #
    # on_delete: :cascade is not decoration. PurgeArticlesJob#cleanup_orphaned_entries
    # removes orphaned entries with Relation#delete_all, which issues a bare SQL
    # DELETE and instantiates nothing, so the has_one's dependent: :destroy never
    # runs on that path. Without the database-level cascade a purge would either
    # leave orphaned summaries behind or fail outright on the foreign key. Every
    # other child of entries (cached_audios, cached_images, enclosures,
    # entry_tags, user_entries) is declared the same way for the same reason.
    create_table :entry_summaries do |t|
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.text :summary, null: false
      # The entry's content_hash as of generation. Compared against the entry's
      # current one to tell a reader the summary predates the text they are
      # looking at; see EntrySummary#stale?.
      t.string :content_hash, null: false
      # Which LLM wrote it. OLLAMA_MODEL is a one-line deploy change, so a stored
      # summary has to carry its own provenance rather than be assumed to match
      # whatever LlmClient defaults to today.
      t.string :model, null: false
      t.datetime :generated_at, null: false
    end

    # Unique because the association is has_one: one current summary per entry,
    # replaced in place when a reader regenerates it. History is not kept.
    add_index :entry_summaries, :entry_id, unique: true
  end
end
