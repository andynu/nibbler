class ConsolidateLabelsToTags < ActiveRecord::Migration[8.1]
  def change
    # Step 1: Rename old tags table (UserEntry-linked) to preserve during transition
    rename_table :tags, :legacy_tags

    # Step 2: Rename labels to tags (Entry-linked)
    rename_table :labels, :tags

    # Step 3: Rename entry_labels to entry_tags
    rename_table :entry_labels, :entry_tags

    # Step 4: Rename caption to name
    rename_column :tags, :caption, :name

    # Step 5: Update foreign key column name in entry_tags
    rename_column :entry_tags, :label_id, :tag_id

    # Step 6: Add index for efficient tag lookups by user and name
    add_index :tags, [ :user_id, :name ], unique: true

    # Step 7: Add unique constraint on entry_tags to prevent duplicates
    add_index :entry_tags, [ :entry_id, :tag_id ], unique: true

    # Step 8: Remove old non-unique indexes that are now redundant
    remove_index :entry_tags, :entry_id if index_exists?(:entry_tags, :entry_id)
    remove_index :entry_tags, :tag_id if index_exists?(:entry_tags, :tag_id)
  end
end
