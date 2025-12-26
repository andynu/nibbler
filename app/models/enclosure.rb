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
