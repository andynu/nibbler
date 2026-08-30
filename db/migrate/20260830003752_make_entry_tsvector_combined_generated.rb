# Move the full-text index off a Rails callback and onto the database.
#
# The old arrangement was a before_save that ran `SELECT to_tsvector(...) ||
# to_tsvector(...)` and read the result as row["to_tsvector"]. PostgreSQL names
# the result of a `||` expression "?column?", so the lookup returned nil and
# every save wrote NULL. Nothing raised, so the column sat empty in production
# (8271 entries, 0 indexed) and Entry.search matched nothing for months.
#
# A GENERATED ALWAYS ... STORED column cannot fail that way. PostgreSQL computes
# it from title and content on every INSERT and UPDATE, and the expression is
# part of the table definition, so there is no code path -- callback skipped,
# insert_all, fixtures, psql -- that can write a row without indexing it.
#
# The expression must be IMMUTABLE, which is why the text search config is
# spelled out ('english' rather than the one-argument to_tsvector, which is only
# STABLE). regexp_replace and left are immutable too; verified against the
# running server.
#
# regexp_replace strips HTML before indexing. It replaces markup with a space,
# so "<p>Bilby</p><p>Bandicoot</p>" indexes as two words. (Rails' strip_tags
# joined them into "BilbyBandicoot" and indexed neither.) It also keeps
# attribute values out of the index: without it, a link's href contributes
# "href", the host, and the path as search terms.
#
# left() bounds the input. A tsvector cannot exceed 1MB, and to_tsvector raises
# rather than truncating, which under a generated column would reject the row
# outright at ingest. 100_000 characters is roughly a 60-page article; anything
# past that is indexed up to the cut instead of failing the insert.
class MakeEntryTsvectorCombinedGenerated < ActiveRecord::Migration[8.1]
  INDEX_NAME = "entries_tsvector_combined_idx".freeze

  EXPRESSION = <<~SQL.squish.freeze
    to_tsvector('english', coalesce(title, '')) ||
    to_tsvector('english', regexp_replace(left(coalesce(content, ''), 100000), '<[^>]*>', ' ', 'g'))
  SQL

  # Adding a generated column rewrites the table, which computes the value for
  # every existing row. That rewrite is the backfill; there is nothing left over
  # to batch. It takes an ACCESS EXCLUSIVE lock for the duration -- a few seconds
  # at the current row count -- and the whole migration is one transaction, so a
  # failure leaves the old column in place and the migration can be re-run.
  def up
    remove_column :entries, :tsvector_combined
    add_column :entries, :tsvector_combined, :virtual, type: :tsvector, as: EXPRESSION, stored: true
    add_index :entries, :tsvector_combined, using: :gin, name: INDEX_NAME
  end

  # Rolling back restores a plain, writable tsvector column. It comes back empty:
  # the values are derived, and the callback that used to (fail to) populate it
  # is gone. Re-running `up` recomputes them.
  def down
    remove_column :entries, :tsvector_combined
    add_column :entries, :tsvector_combined, :tsvector
    add_index :entries, :tsvector_combined, using: :gin, name: INDEX_NAME
  end
end
