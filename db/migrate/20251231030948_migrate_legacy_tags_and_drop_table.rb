class MigrateLegacyTagsAndDropTable < ActiveRecord::Migration[8.1]
  def up
    # Step 1: Create tags for each unique (user_id, tag_name) from legacy_tags
    # Using a default gray color for migrated tags
    execute <<~SQL
      INSERT INTO tags (user_id, name, bg_color, fg_color)
      SELECT DISTINCT user_id, tag_name, '#64748b', '#ffffff'
      FROM legacy_tags
      ON CONFLICT (user_id, name) DO NOTHING
    SQL

    # Step 2: Create entry_tags linking entries to tags
    # Join through user_entries to get entry_id
    execute <<~SQL
      INSERT INTO entry_tags (entry_id, tag_id)
      SELECT DISTINCT ue.entry_id, t.id
      FROM legacy_tags lt
      JOIN user_entries ue ON ue.id = lt.user_entry_id
      JOIN tags t ON t.user_id = lt.user_id AND t.name = lt.tag_name
      ON CONFLICT (entry_id, tag_id) DO NOTHING
    SQL

    # Step 3: Drop the legacy_tags table
    drop_table :legacy_tags
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Cannot restore legacy_tags data"
  end
end
