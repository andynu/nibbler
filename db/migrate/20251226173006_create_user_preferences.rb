class CreateUserPreferences < ActiveRecord::Migration[8.1]
  def change
    create_table :user_preferences do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :pref_name, null: false
      t.text :value, null: false
    end

    # user_id index created automatically by t.references
    add_index :user_preferences, :pref_name
    add_index :user_preferences, [:pref_name, :user_id], unique: true
  end
end
