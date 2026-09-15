# A search vector over the fetched article, so search can match the text the
# reading pane shows and not only what the feed sent.
#
# On this table rather than folded into entries.tsvector_combined: a generated
# column can read only its own row. Entry::TEXT_SEARCH_JOIN_SQL brings the two
# vectors together at query time, and is where "usable" (ok, not stale) is
# decided, since staleness compares against a column of entries.
#
# The expression is the content half of tsvector_combined's; see
# 20260830003752_make_entry_tsvector_combined_generated.rb for why each part of
# it is there.
#
# No GIN index. Search reads this column only concatenated with
# entries.tsvector_combined, an expression no index on either column can serve.
#
# Adding a stored generated column rewrites the table, which computes the value
# for every existing row, so there is no separate backfill.
class AddTsvectorContentToEntryFullTexts < ActiveRecord::Migration[8.1]
  EXPRESSION = <<~SQL.squish.freeze
    to_tsvector('english', regexp_replace(left(coalesce(content, ''), 100000), '<[^>]*>', ' ', 'g'))
  SQL

  def change
    add_column :entry_full_texts, :tsvector_content, :virtual, type: :tsvector, as: EXPRESSION, stored: true
  end
end
