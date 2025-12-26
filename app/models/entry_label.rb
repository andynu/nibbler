class EntryLabel < ApplicationRecord
  belongs_to :label
  belongs_to :entry
end
