class CreateFilterRules < ActiveRecord::Migration[8.1]
  # Filter types:
  # 1 = title, 2 = content, 3 = both, 4 = link, 5 = date, 6 = author, 7 = tag
  def change
    create_table :filter_rules do |t|
      t.references :filter, null: false, foreign_key: { on_delete: :cascade }
      t.text :reg_exp, null: false
      t.boolean :inverse, null: false, default: false
      t.integer :filter_type, null: false
      t.references :feed, foreign_key: { on_delete: :cascade }
      t.references :category, foreign_key: { on_delete: :cascade }
      t.text :match_on
      t.boolean :cat_filter, null: false, default: false
    end
  end
end
