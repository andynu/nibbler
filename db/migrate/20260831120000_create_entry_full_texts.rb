class CreateEntryFullTexts < ActiveRecord::Migration[8.1]
  def change
    # Derived article text, kept beside entries rather than in them.
    #
    # Never in entries.content. That column is what the feed published, and
    # entries.content_hash is a digest of it; overwriting either would make the
    # ingest path's update detection compare a fetched page against a feed body
    # and call every subsequent refresh a change. It would also invalidate the
    # audio and summary caches, which key off that same hash. A separate table
    # leaves all of it alone.
    #
    # A table rather than columns on entries for the reason CreateEntrySummaries
    # gives: entries is the most queried table in the app, and a fetched body
    # exists for a small minority of rows.
    #
    # on_delete: :cascade for the reason every other child of entries has it:
    # PurgeArticlesJob#cleanup_orphaned_entries deletes with Relation#delete_all,
    # which instantiates nothing, so dependent: :destroy never runs on that path.
    create_table :entry_full_texts do |t|
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }, index: false

      # "ok" or "failed". A failed row is a real row on purpose: it is what stops
      # the next open from refetching a site that just refused us. See
      # EntryFullText::RETRY_AFTER.
      t.string :status, null: false

      # The extracted article, sanitized by ContentSanitizer exactly as feed
      # bodies are at ingest. Empty string on a failed fetch: this is derived
      # data, and a NULL would mean the same thing with an extra branch at every
      # reader.
      t.text :content, null: false, default: ""

      # Length of the ArticleText-normalized text, stored so a caller can ask
      # "is there enough here" without stripping the markup again. Zero on a
      # failed fetch.
      t.integer :char_count, null: false, default: 0

      # The entry's content_hash as of the fetch, compared against the entry's
      # current one by EntryFullText#stale?. Same mechanism as
      # entry_summaries.content_hash: when the feed republishes the article, the
      # page behind it has usually changed too, so the fetched copy stops being
      # current at the same moment the summary does.
      t.string :content_hash, null: false

      # Why the fetch failed, for the log and for anyone reading the table by
      # hand. Never rendered: the reader gets one generic message whatever went
      # wrong, because most of the ways a page refuses to be read are
      # indistinguishable from each other from this side. NULL when status is
      # "ok".
      t.string :failure_detail

      t.datetime :fetched_at, null: false
    end

    # Unique because the association is has_one: one current answer per entry,
    # replaced in place when it is refetched. History is not kept.
    add_index :entry_full_texts, :entry_id, unique: true
  end
end
