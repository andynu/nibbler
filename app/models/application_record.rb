# Base class for all application models.
#
# Provides shared configuration and behavior inherited by all domain models
# in the feed reader application.
class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
