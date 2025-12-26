class CreateFeeds < ActiveRecord::Migration[8.1]
  def change
    create_table :feeds do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false
      t.references :category, foreign_key: true
      t.text :feed_url, null: false
      t.string :icon_url, null: false, default: ""
      t.integer :update_interval, null: false, default: 0
      t.integer :purge_interval, null: false, default: 0
      t.datetime :last_updated
      t.datetime :last_unconditional
      t.text :last_error, null: false, default: ""
      t.string :last_modified, null: false, default: ""
      t.string :favicon_avg_color
      t.boolean :favicon_is_custom
      t.string :site_url, null: false, default: ""
      t.string :auth_login, null: false, default: ""
      t.text :auth_pass, null: false, default: ""
      t.boolean :auth_pass_encrypted, null: false, default: false
      t.references :parent_feed, foreign_key: { to_table: :feeds }
      t.boolean :private, null: false, default: false
      t.boolean :hidden, null: false, default: false
      t.boolean :include_in_digest, null: false, default: true
      t.boolean :rtl_content, null: false, default: false
      t.boolean :cache_images, null: false, default: false
      t.boolean :hide_images, null: false, default: false
      t.boolean :cache_content, null: false, default: false
      t.datetime :last_viewed
      t.datetime :last_update_started
      t.datetime :last_successful_update
      t.integer :update_method, null: false, default: 0
      t.boolean :always_display_enclosures, null: false, default: false
      t.integer :order_id, null: false, default: 0
      t.boolean :mark_unread_on_update, null: false, default: false
      t.boolean :update_on_checksum_change, null: false, default: false
      t.boolean :strip_images, null: false, default: false
      t.string :view_settings, null: false, default: ""
      t.integer :pubsub_state, null: false, default: 0
      t.datetime :favicon_last_checked
      t.string :feed_language, null: false, default: ""
    end

    # user_id and category_id indexes created automatically by t.references
    add_index :feeds, [:feed_url, :user_id], unique: true
  end
end
