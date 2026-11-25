class AddPaperTagToUserEntries < ActiveRecord::Migration[8.1]
  def change
    add_reference :user_entries, :paper_tag, null: true, index: true,
      foreign_key: { to_table: :tags, on_delete: :nullify }
  end
end
