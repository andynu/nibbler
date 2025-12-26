# Join model linking entries to labels.
#
# EntryLabel provides the many-to-many relationship between Entry and Label,
# allowing users to apply multiple labels to any entry and query entries
# by label.
#
# @see Entry for the labeled article
# @see Label for the classification applied
class EntryLabel < ApplicationRecord
  belongs_to :label
  belongs_to :entry
end
