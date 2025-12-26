# Represents a media attachment on an entry (podcast audio, video, image).
#
# Enclosures are media files attached to RSS/Atom entries, commonly used for
# podcasts and video feeds. Each enclosure has a URL, MIME type, and optional
# metadata like duration and title.
#
# Helper methods identify the media type (video?, audio?, image?) for
# appropriate UI rendering.
#
# @see Entry for the parent article containing this media
class Enclosure < ApplicationRecord
  belongs_to :entry

  validates :content_url, presence: true
  validates :content_type, presence: true

  def video?
    content_type.start_with?("video/")
  end

  def audio?
    content_type.start_with?("audio/")
  end

  def image?
    content_type.start_with?("image/")
  end
end
