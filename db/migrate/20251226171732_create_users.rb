class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :login, null: false
      t.string :pwd_hash, null: false
      t.datetime :last_login
      t.integer :access_level, null: false, default: 0
      t.string :email, null: false, default: ""
      t.string :full_name, null: false, default: ""
      t.boolean :email_digest, null: false, default: false
      t.datetime :last_digest_sent
      t.string :salt, null: false, default: ""
      t.boolean :otp_enabled, null: false, default: false
      t.string :otp_secret
      t.string :resetpass_token
      t.datetime :last_auth_attempt
      t.datetime :created_at
    end
    add_index :users, :login, unique: true
  end
end
