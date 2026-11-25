class CreateEntryTagRuleMatches < ActiveRecord::Migration[8.1]
  def change
    create_table :entry_tag_rule_matches do |t|
      t.references :entry, null: false, index: false, foreign_key: { on_delete: :cascade }
      t.references :tag_rule, null: false, foreign_key: { on_delete: :cascade }
      t.datetime :created_at, null: false
    end

    add_index :entry_tag_rule_matches, [ :entry_id, :tag_rule_id ], unique: true
  end
end
