class CreateCategories < ActiveRecord::Migration[8.1]
  def change
    create_table :categories do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false
      t.boolean :collapsed, null: false, default: false
      t.integer :order_id, null: false, default: 0
      t.string :view_settings, null: false, default: ""
      t.references :parent, foreign_key: { to_table: :categories }, on_delete: :nullify
    end
  end
end
