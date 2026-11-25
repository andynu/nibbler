class CreateTagRules < ActiveRecord::Migration[8.1]
  def change
    create_table :tag_rules do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.references :tag, null: false, index: false, foreign_key: { on_delete: :cascade }
      t.text :query, null: false
      t.references :feed, foreign_key: { on_delete: :cascade }
      t.references :category, foreign_key: { on_delete: :cascade }
      t.timestamps
    end

    add_index :tag_rules, [ :tag_id, :query, :feed_id, :category_id ],
      unique: true, nulls_not_distinct: true, name: "index_tag_rules_uniqueness"
    add_check_constraint :tag_rules, "feed_id IS NULL OR category_id IS NULL",
      name: "tag_rules_single_scope"
  end
end
