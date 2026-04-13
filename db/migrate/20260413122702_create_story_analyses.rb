class CreateStoryAnalyses < ActiveRecord::Migration[8.1]
  def change
    create_table :story_analyses do |t|
      t.references :story, null: false, foreign_key: { on_delete: :cascade }
      t.boolean :new_development, null: false, default: false
      t.boolean :concluded, null: false, default: false
      t.string :timeline_label
      t.text :summary
      t.text :rationale
      t.jsonb :article_ids, null: false, default: []
      t.datetime :created_at, null: false
    end

    add_index :story_analyses, [:story_id, :created_at]
  end
end
