class CreateFilters < ActiveRecord::Migration[8.1]
  def change
    create_table :filters do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :title, null: false, default: ""
      t.boolean :match_any_rule, null: false, default: false
      t.boolean :inverse, null: false, default: false
      t.integer :order_id, null: false, default: 0
      t.datetime :last_triggered
      t.boolean :enabled, null: false, default: true
    end
  end
end
