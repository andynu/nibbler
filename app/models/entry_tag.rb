# Join model linking entries to tags.
#
# EntryTag provides the many-to-many relationship between Entry and Tag,
# allowing users to apply multiple tags to any entry and query entries
# by tag.
#
# @see Entry for the tagged article
# @see Tag for the classification applied
class EntryTag < ApplicationRecord
  belongs_to :tag
  belongs_to :entry
end
