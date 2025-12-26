class Tag < ApplicationRecord
  belongs_to :user
  belongs_to :user_entry

  validates :tag_name, presence: true
end
