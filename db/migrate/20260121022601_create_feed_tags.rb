# Creates the join table linking feeds to tags.
#
# FeedTags track which tags are auto-applied to entries in a feed.
# When a tag is added to a feed, all matching entries in that feed
# receive the tag. New entries are automatically tagged on arrival.
class CreateFeedTags < ActiveRecord::Migration[8.1]
  def change
    create_table :feed_tags do |t|
      t.references :feed, null: false, foreign_key: { on_delete: :cascade }
      t.references :tag, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
    end

    add_index :feed_tags, [ :feed_id, :tag_id ], unique: true
  end
end
