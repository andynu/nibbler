# Exports user's feeds to OPML format
class OpmlExporter
  def initialize(user)
    @user = user
  end

  def export
    builder = Nokogiri::XML::Builder.new(encoding: "UTF-8") do |xml|
      xml.opml(version: "2.0") do
        xml.head do
          xml.title "#{@user.login}'s TTRB Subscriptions"
          xml.dateCreated Time.current.rfc2822
        end
        xml.body do
          export_categories(xml)
          export_uncategorized_feeds(xml)
        end
      end
    end

    builder.to_xml
  end

  private

  def export_categories(xml)
    @user.categories.roots.ordered.each do |category|
      export_category(xml, category)
    end
  end

  def export_category(xml, category)
    xml.outline(text: category.title, title: category.title) do
      # Export feeds in this category
      category.feeds.ordered.each do |feed|
        export_feed(xml, feed)
      end

      # Export child categories
      category.children.ordered.each do |child|
        export_category(xml, child)
      end
    end
  end

  def export_uncategorized_feeds(xml)
    @user.feeds.where(category: nil).ordered.each do |feed|
      export_feed(xml, feed)
    end
  end

  def export_feed(xml, feed)
    xml.outline(
      type: "rss",
      text: feed.title,
      title: feed.title,
      xmlUrl: feed.feed_url,
      htmlUrl: feed.site_url.presence
    )
  end
end
