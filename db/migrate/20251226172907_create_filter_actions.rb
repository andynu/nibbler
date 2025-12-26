class CreateFilterActions < ActiveRecord::Migration[8.1]
  # Action types:
  # 1 = delete, 2 = mark_read, 3 = star, 4 = tag, 5 = publish,
  # 6 = score, 7 = label, 8 = stop, 9 = plugin, 10 = ignore_tag
  def change
    create_table :filter_actions do |t|
      t.references :filter, null: false, foreign_key: { on_delete: :cascade }
      t.integer :action_type, null: false, default: 1
      t.string :action_param, null: false, default: ""
    end
  end
end
