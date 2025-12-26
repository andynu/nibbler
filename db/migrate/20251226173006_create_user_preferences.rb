class CreateUserPreferences < ActiveRecord::Migration[8.1]
  def change
    create_table :user_preferences do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :pref_name, null: false
      t.text :value, null: false
    end

    add_index :user_preferences, :user_id
    add_index :user_preferences, :pref_name
    add_index :user_preferences, [:pref_name, :user_id], unique: true
  end
end
