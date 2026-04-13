class AddWrapupToStories < ActiveRecord::Migration[8.1]
  def change
    add_column :stories, :wrapup, :text
    add_column :stories, :wrapup_generated_at, :datetime
  end
end
