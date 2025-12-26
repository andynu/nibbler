class CreateLabels < ActiveRecord::Migration[8.1]
  def change
    create_table :labels do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :caption, null: false
      t.string :fg_color, null: false, default: ""
      t.string :bg_color, null: false, default: ""
    end
  end
end
