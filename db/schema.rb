# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2025_12_27_180119) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "categories", force: :cascade do |t|
    t.boolean "collapsed", default: false, null: false
    t.integer "order_id", default: 0, null: false
    t.bigint "parent_id"
    t.string "title", null: false
    t.bigint "user_id", null: false
    t.string "view_settings", default: "", null: false
    t.index ["parent_id"], name: "index_categories_on_parent_id"
    t.index ["user_id"], name: "index_categories_on_user_id"
  end

  create_table "enclosures", force: :cascade do |t|
    t.string "content_type", null: false
    t.text "content_url", null: false
    t.string "duration", null: false
    t.bigint "entry_id", null: false
    t.integer "height", default: 0, null: false
    t.text "title", null: false
    t.integer "width", default: 0, null: false
    t.index ["entry_id"], name: "index_enclosures_on_entry_id"
  end

  create_table "entries", force: :cascade do |t|
    t.string "author", default: "", null: false
    t.text "cached_content"
    t.string "comments", default: "", null: false
    t.text "content", null: false
    t.string "content_hash", null: false
    t.datetime "date_entered", null: false
    t.datetime "date_updated", null: false
    t.text "guid", null: false
    t.string "lang", limit: 2
    t.text "link", null: false
    t.boolean "no_orig_date", default: false, null: false
    t.integer "num_comments", default: 0, null: false
    t.text "plugin_data"
    t.text "title", null: false
    t.tsvector "tsvector_combined"
    t.datetime "updated", null: false
    t.index ["date_entered"], name: "index_entries_on_date_entered"
    t.index ["guid"], name: "index_entries_on_guid", unique: true
    t.index ["tsvector_combined"], name: "entries_tsvector_combined_idx", using: :gin
    t.index ["updated"], name: "index_entries_on_updated"
  end

  create_table "entry_labels", force: :cascade do |t|
    t.bigint "entry_id", null: false
    t.bigint "label_id", null: false
    t.index ["entry_id"], name: "index_entry_labels_on_entry_id"
    t.index ["label_id"], name: "index_entry_labels_on_label_id"
  end

  create_table "feeds", force: :cascade do |t|
    t.boolean "always_display_enclosures", default: false, null: false
    t.string "auth_login", default: "", null: false
    t.text "auth_pass", default: "", null: false
    t.boolean "auth_pass_encrypted", default: false, null: false
    t.boolean "cache_content", default: false, null: false
    t.boolean "cache_images", default: false, null: false
    t.bigint "category_id"
    t.integer "consecutive_failures", default: 0, null: false
    t.string "etag", default: "", null: false
    t.string "favicon_avg_color"
    t.boolean "favicon_is_custom"
    t.datetime "favicon_last_checked"
    t.string "feed_language", default: "", null: false
    t.text "feed_url", null: false
    t.boolean "hidden", default: false, null: false
    t.boolean "hide_images", default: false, null: false
    t.string "icon_url", default: "", null: false
    t.boolean "include_in_digest", default: true, null: false
    t.text "last_error", default: "", null: false
    t.string "last_modified", default: "", null: false
    t.datetime "last_successful_update"
    t.datetime "last_unconditional"
    t.datetime "last_update_started"
    t.datetime "last_updated"
    t.datetime "last_viewed"
    t.boolean "mark_unread_on_update", default: false, null: false
    t.integer "order_id", default: 0, null: false
    t.bigint "parent_feed_id"
    t.boolean "private", default: false, null: false
    t.integer "pubsub_state", default: 0, null: false
    t.integer "purge_interval", default: 0, null: false
    t.datetime "retry_after"
    t.boolean "rtl_content", default: false, null: false
    t.string "site_url", default: "", null: false
    t.boolean "strip_images", default: false, null: false
    t.string "title", null: false
    t.integer "update_interval", default: 0, null: false
    t.integer "update_method", default: 0, null: false
    t.boolean "update_on_checksum_change", default: false, null: false
    t.bigint "user_id", null: false
    t.string "view_settings", default: "", null: false
    t.index ["category_id"], name: "index_feeds_on_category_id"
    t.index ["feed_url", "user_id"], name: "index_feeds_on_feed_url_and_user_id", unique: true
    t.index ["parent_feed_id"], name: "index_feeds_on_parent_feed_id"
    t.index ["user_id"], name: "index_feeds_on_user_id"
  end

  create_table "filter_actions", force: :cascade do |t|
    t.string "action_param", default: "", null: false
    t.integer "action_type", default: 1, null: false
    t.bigint "filter_id", null: false
    t.index ["filter_id"], name: "index_filter_actions_on_filter_id"
  end

  create_table "filter_rules", force: :cascade do |t|
    t.boolean "cat_filter", default: false, null: false
    t.bigint "category_id"
    t.bigint "feed_id"
    t.bigint "filter_id", null: false
    t.integer "filter_type", null: false
    t.boolean "inverse", default: false, null: false
    t.text "match_on"
    t.text "reg_exp", null: false
    t.index ["category_id"], name: "index_filter_rules_on_category_id"
    t.index ["feed_id"], name: "index_filter_rules_on_feed_id"
    t.index ["filter_id"], name: "index_filter_rules_on_filter_id"
  end

  create_table "filters", force: :cascade do |t|
    t.boolean "enabled", default: true, null: false
    t.boolean "inverse", default: false, null: false
    t.datetime "last_triggered"
    t.boolean "match_any_rule", default: false, null: false
    t.integer "order_id", default: 0, null: false
    t.string "title", default: "", null: false
    t.bigint "user_id", null: false
    t.index ["user_id"], name: "index_filters_on_user_id"
  end

  create_table "labels", force: :cascade do |t|
    t.string "bg_color", default: "", null: false
    t.string "caption", null: false
    t.string "fg_color", default: "", null: false
    t.bigint "user_id", null: false
    t.index ["user_id"], name: "index_labels_on_user_id"
  end

  create_table "tags", force: :cascade do |t|
    t.string "tag_name", null: false
    t.bigint "user_entry_id", null: false
    t.bigint "user_id", null: false
    t.index ["user_entry_id"], name: "index_tags_on_user_entry_id"
    t.index ["user_id"], name: "index_tags_on_user_id"
  end

  create_table "user_entries", force: :cascade do |t|
    t.bigint "entry_id", null: false
    t.bigint "feed_id"
    t.text "label_cache", default: "", null: false
    t.datetime "last_marked"
    t.datetime "last_published"
    t.datetime "last_read"
    t.boolean "marked", default: false, null: false
    t.text "note"
    t.integer "orig_feed_id"
    t.boolean "published", default: false, null: false
    t.integer "score", default: 0, null: false
    t.text "tag_cache", default: "", null: false
    t.boolean "unread", default: true, null: false
    t.bigint "user_id", null: false
    t.string "uuid", null: false
    t.index ["entry_id"], name: "index_user_entries_on_entry_id"
    t.index ["feed_id"], name: "index_user_entries_on_feed_id"
    t.index ["unread"], name: "index_user_entries_on_unread"
    t.index ["user_id"], name: "index_user_entries_on_user_id"
  end

  create_table "user_preferences", force: :cascade do |t|
    t.string "pref_name", null: false
    t.bigint "user_id", null: false
    t.text "value", null: false
    t.index ["pref_name", "user_id"], name: "index_user_preferences_on_pref_name_and_user_id", unique: true
    t.index ["pref_name"], name: "index_user_preferences_on_pref_name"
    t.index ["user_id"], name: "index_user_preferences_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.integer "access_level", default: 0, null: false
    t.datetime "created_at"
    t.string "email", default: "", null: false
    t.boolean "email_digest", default: false, null: false
    t.string "full_name", default: "", null: false
    t.datetime "last_auth_attempt"
    t.datetime "last_digest_sent"
    t.datetime "last_login"
    t.string "login", null: false
    t.boolean "otp_enabled", default: false, null: false
    t.string "otp_secret"
    t.string "pwd_hash", null: false
    t.string "resetpass_token"
    t.string "salt", default: "", null: false
    t.index ["login"], name: "index_users_on_login", unique: true
  end

  add_foreign_key "categories", "categories", column: "parent_id", on_delete: :nullify
  add_foreign_key "categories", "users"
  add_foreign_key "enclosures", "entries", on_delete: :cascade
  add_foreign_key "entry_labels", "entries", on_delete: :cascade
  add_foreign_key "entry_labels", "labels", on_delete: :cascade
  add_foreign_key "feeds", "categories"
  add_foreign_key "feeds", "feeds", column: "parent_feed_id"
  add_foreign_key "feeds", "users"
  add_foreign_key "filter_actions", "filters", on_delete: :cascade
  add_foreign_key "filter_rules", "categories", on_delete: :cascade
  add_foreign_key "filter_rules", "feeds", on_delete: :cascade
  add_foreign_key "filter_rules", "filters", on_delete: :cascade
  add_foreign_key "filters", "users", on_delete: :cascade
  add_foreign_key "labels", "users", on_delete: :cascade
  add_foreign_key "tags", "user_entries", on_delete: :cascade
  add_foreign_key "tags", "users", on_delete: :cascade
  add_foreign_key "user_entries", "entries", on_delete: :cascade
  add_foreign_key "user_entries", "feeds", on_delete: :cascade
  add_foreign_key "user_entries", "users", on_delete: :cascade
  add_foreign_key "user_preferences", "users", on_delete: :cascade
end
