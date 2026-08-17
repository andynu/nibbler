class CreateStoryArticles < ActiveRecord::Migration[8.1]
  def change
    create_table :story_articles do |t|
      t.references :story, null: false, foreign_key: { on_delete: :cascade }
      t.string :url, null: false
      t.string :title
      t.text :snippet
      t.string :source
      t.datetime :published_at
      t.datetime :fetched_at
    end

    add_index :story_articles, [ :story_id, :url ], unique: true
  end
end
