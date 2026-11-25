class AddPaperSettingsToTags < ActiveRecord::Migration[8.1]
  def change
    add_column :tags, :include_in_paper, :boolean, default: false, null: false
    add_column :tags, :paper_limit, :integer, default: 5, null: false
    add_check_constraint :tags, "paper_limit > 0", name: "tags_paper_limit_positive"
  end
end
