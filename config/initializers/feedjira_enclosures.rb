# Feedjira reads <enclosure> attributes only on ITunesRSSItem, which it picks
# when a channel declares the iTunes namespace. Every other RSS 2.0 channel
# parses as RSSEntry, whose only mapping for <enclosure> and <media:content> is
# :image -- the url, with type, length and every attachment after the first
# dropped. These additions give those channels the same reading. ITunesRSSItem
# is left out deliberately: it already declares them.

module Feedjira
  module Parser
    # One <media:content>, Media RSS's repeatable attachment.
    class MediaContent
      include SAXMachine

      attribute :url
      attribute :type
      attribute :fileSize, as: :file_size

      element :"media:title", as: :title
    end
  end
end

# Reading media:content as a collection shadows Feedjira's single-value
# media:content -> image mapping, so #image is nil on an entry whose only
# attachment is a media:content. Nothing here reads #image.
[ Feedjira::Parser::RSSEntry, Feedjira::Parser::RSSFeedBurnerEntry ].each do |entry_class|
  entry_class.class_eval do
    element :enclosure, value: :url, as: :enclosure_url
    element :enclosure, value: :type, as: :enclosure_type
    element :enclosure, value: :length, as: :enclosure_length

    elements :"media:content", as: :media_contents, class: Feedjira::Parser::MediaContent
  end
end
