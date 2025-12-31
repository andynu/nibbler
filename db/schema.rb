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

ActiveRecord::Schema[8.1].define(version: 2025_12_31_055437) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "cached_audios", force: :cascade do |t|
    t.string "audio_filename", null: false
    t.datetime "cached_at", null: false
    t.string "content_hash", null: false
    t.float "duration", null: false
    t.bigint "entry_id", null: false
    t.json "timestamps", null: false
    t.index ["content_hash"], name: "index_cached_audios_on_content_hash"
    t.index ["entry_id"], name: "index_cached_audios_on_entry_id", unique: true
  end

  create_table "cached_images", force: :cascade do |t|
    t.datetime "cached_at", null: false
    t.string "cached_filename", null: false
    t.string "content_type", default: "", null: false
    t.bigint "entry_id", null: false
    t.integer "file_size", default: 0, null: false
    t.text "original_url", null: false
    t.index ["entry_id", "original_url"], name: "index_cached_images_on_entry_id_and_original_url", unique: true
    t.index ["entry_id"], name: "index_cached_images_on_entry_id"
  end

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

  create_table "entry_tags", force: :cascade do |t|
    t.bigint "entry_id", null: false
    t.bigint "tag_id", null: false
    t.index ["entry_id", "tag_id"], name: "index_entry_tags_on_entry_id_and_tag_id", unique: true
  end

  create_table "feeds", force: :cascade do |t|
    t.boolean "always_display_enclosures", default: false, null: false
    t.string "auth_login", default: "", null: false
    t.text "auth_pass", default: "", null: false
    t.boolean "auth_pass_encrypted", default: false, null: false
    t.float "avg_posts_per_day", default: 0.0, null: false
    t.boolean "cache_content", default: false, null: false
    t.boolean "cache_images", default: false, null: false
    t.integer "calculated_interval_seconds"
    t.bigint "category_id"
    t.integer "consecutive_failures", default: 0, null: false
    t.integer "entry_count", default: 0, null: false
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
    t.datetime "last_new_entry_at"
    t.datetime "last_successful_update"
    t.datetime "last_unconditional"
    t.datetime "last_update_started"
    t.datetime "last_updated"
    t.datetime "last_viewed"
    t.boolean "mark_unread_on_update", default: false, null: false
    t.datetime "newest_entry_date"
    t.datetime "next_poll_at"
    t.datetime "oldest_entry_date"
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
    t.index ["next_poll_at"], name: "index_feeds_on_next_poll_at"
    t.index ["parent_feed_id"], name: "index_feeds_on_parent_feed_id"
    t.index ["user_id"], name: "index_feeds_on_user_id"
  end

  create_table "filter_actions", force: :cascade do |t|
    t.string "action_param", default: "", null: false
    t.string "action_type", default: "mark_read", null: false
    t.bigint "filter_id", null: false
    t.index ["filter_id"], name: "index_filter_actions_on_filter_id"
  end

  create_table "filter_rules", force: :cascade do |t|
    t.boolean "cat_filter", default: false, null: false
    t.bigint "category_id"
    t.bigint "feed_id"
    t.bigint "filter_id", null: false
    t.string "filter_type", null: false
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

  create_table "good_job_batches", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "callback_priority"
    t.text "callback_queue_name"
    t.datetime "created_at", null: false
    t.text "description"
    t.datetime "discarded_at"
    t.datetime "enqueued_at"
    t.datetime "finished_at"
    t.datetime "jobs_finished_at"
    t.text "on_discard"
    t.text "on_finish"
    t.text "on_success"
    t.jsonb "serialized_properties"
    t.datetime "updated_at", null: false
  end

  create_table "good_job_executions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "active_job_id", null: false
    t.datetime "created_at", null: false
    t.interval "duration"
    t.text "error"
    t.text "error_backtrace", array: true
    t.integer "error_event", limit: 2
    t.datetime "finished_at"
    t.text "job_class"
    t.uuid "process_id"
    t.text "queue_name"
    t.datetime "scheduled_at"
    t.jsonb "serialized_params"
    t.datetime "updated_at", null: false
    t.index ["active_job_id", "created_at"], name: "index_good_job_executions_on_active_job_id_and_created_at"
    t.index ["process_id", "created_at"], name: "index_good_job_executions_on_process_id_and_created_at"
  end

  create_table "good_job_processes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "lock_type", limit: 2
    t.jsonb "state"
    t.datetime "updated_at", null: false
  end

  create_table "good_job_settings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "key"
    t.datetime "updated_at", null: false
    t.jsonb "value"
    t.index ["key"], name: "index_good_job_settings_on_key", unique: true
  end

  create_table "good_jobs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "active_job_id"
    t.uuid "batch_callback_id"
    t.uuid "batch_id"
    t.text "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "cron_at"
    t.text "cron_key"
    t.text "error"
    t.integer "error_event", limit: 2
    t.integer "executions_count"
    t.datetime "finished_at"
    t.boolean "is_discrete"
    t.text "job_class"
    t.text "labels", array: true
    t.datetime "locked_at"
    t.uuid "locked_by_id"
    t.datetime "performed_at"
    t.integer "priority"
    t.text "queue_name"
    t.uuid "retried_good_job_id"
    t.datetime "scheduled_at"
    t.jsonb "serialized_params"
    t.datetime "updated_at", null: false
    t.index ["active_job_id", "created_at"], name: "index_good_jobs_on_active_job_id_and_created_at"
    t.index ["batch_callback_id"], name: "index_good_jobs_on_batch_callback_id", where: "(batch_callback_id IS NOT NULL)"
    t.index ["batch_id"], name: "index_good_jobs_on_batch_id", where: "(batch_id IS NOT NULL)"
    t.index ["concurrency_key", "created_at"], name: "index_good_jobs_on_concurrency_key_and_created_at"
    t.index ["concurrency_key"], name: "index_good_jobs_on_concurrency_key_when_unfinished", where: "(finished_at IS NULL)"
    t.index ["cron_key", "created_at"], name: "index_good_jobs_on_cron_key_and_created_at_cond", where: "(cron_key IS NOT NULL)"
    t.index ["cron_key", "cron_at"], name: "index_good_jobs_on_cron_key_and_cron_at_cond", unique: true, where: "(cron_key IS NOT NULL)"
    t.index ["finished_at"], name: "index_good_jobs_jobs_on_finished_at_only", where: "(finished_at IS NOT NULL)"
    t.index ["job_class"], name: "index_good_jobs_on_job_class"
    t.index ["labels"], name: "index_good_jobs_on_labels", where: "(labels IS NOT NULL)", using: :gin
    t.index ["locked_by_id"], name: "index_good_jobs_on_locked_by_id", where: "(locked_by_id IS NOT NULL)"
    t.index ["priority", "created_at"], name: "index_good_job_jobs_for_candidate_lookup", where: "(finished_at IS NULL)"
    t.index ["priority", "created_at"], name: "index_good_jobs_jobs_on_priority_created_at_when_unfinished", order: { priority: "DESC NULLS LAST" }, where: "(finished_at IS NULL)"
    t.index ["priority", "scheduled_at"], name: "index_good_jobs_on_priority_scheduled_at_unfinished_unlocked", where: "((finished_at IS NULL) AND (locked_by_id IS NULL))"
    t.index ["queue_name", "scheduled_at"], name: "index_good_jobs_on_queue_name_and_scheduled_at", where: "(finished_at IS NULL)"
    t.index ["scheduled_at"], name: "index_good_jobs_on_scheduled_at", where: "(finished_at IS NULL)"
  end

  create_table "tags", force: :cascade do |t|
    t.string "bg_color", default: "", null: false
    t.string "fg_color", default: "", null: false
    t.string "name", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "name"], name: "index_tags_on_user_id_and_name", unique: true
    t.index ["user_id"], name: "index_tags_on_user_id"
  end

  create_table "user_entries", force: :cascade do |t|
    t.bigint "entry_id", null: false
    t.bigint "feed_id"
    t.datetime "last_marked"
    t.datetime "last_published"
    t.datetime "last_read"
    t.boolean "marked", default: false, null: false
    t.text "note"
    t.integer "orig_feed_id"
    t.boolean "published", default: false, null: false
    t.integer "score", default: 0, null: false
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
    t.string "access_key"
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
    t.index ["access_key"], name: "index_users_on_access_key", unique: true
    t.index ["login"], name: "index_users_on_login", unique: true
  end

  add_foreign_key "cached_audios", "entries", on_delete: :cascade
  add_foreign_key "cached_images", "entries", on_delete: :cascade
  add_foreign_key "categories", "categories", column: "parent_id", on_delete: :nullify
  add_foreign_key "categories", "users"
  add_foreign_key "enclosures", "entries", on_delete: :cascade
  add_foreign_key "entry_tags", "entries", on_delete: :cascade
  add_foreign_key "entry_tags", "tags", on_delete: :cascade
  add_foreign_key "feeds", "categories"
  add_foreign_key "feeds", "feeds", column: "parent_feed_id"
  add_foreign_key "feeds", "users"
  add_foreign_key "filter_actions", "filters", on_delete: :cascade
  add_foreign_key "filter_rules", "categories", on_delete: :cascade
  add_foreign_key "filter_rules", "feeds", on_delete: :cascade
  add_foreign_key "filter_rules", "filters", on_delete: :cascade
  add_foreign_key "filters", "users", on_delete: :cascade
  add_foreign_key "tags", "users", on_delete: :cascade
  add_foreign_key "user_entries", "entries", on_delete: :cascade
  add_foreign_key "user_entries", "feeds", on_delete: :cascade
  add_foreign_key "user_entries", "users", on_delete: :cascade
  add_foreign_key "user_preferences", "users", on_delete: :cascade
end
