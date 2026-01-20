class ChangePwdHashToNullable < ActiveRecord::Migration[8.1]
  def change
    change_column_null :users, :pwd_hash, true
    change_column_null :users, :salt, true
  end
end
