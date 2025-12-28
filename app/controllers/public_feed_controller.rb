# Serves public RSS/Atom feeds for published articles.
#
# Articles marked as "published" by a user become available through a public
# feed endpoint that requires only the user's access_key - no authentication.
# This allows sharing published articles with feed readers or other services.
class PublicFeedController < ActionController::Base
  before_action :find_user_by_access_key

  # GET /public/feed/:access_key.atom
  def show
    @published_entries = @user.user_entries
      .published
      .includes(entry: :enclosures)
      .joins(:entry)
      .order("entries.date_entered DESC")
      .limit(50)

    respond_to do |format|
      format.atom { render xml: build_atom_feed }
    end
  end

  private

  def find_user_by_access_key
    @user = User.find_by(access_key: params[:access_key])
    unless @user
      head :not_found
    end
  end

  def build_atom_feed
    xml = Builder::XmlMarkup.new(indent: 2)
    xml.instruct! :xml, version: "1.0", encoding: "UTF-8"

    xml.feed(xmlns: "http://www.w3.org/2005/Atom") do
      xml.title("#{@user.login}'s Published Articles")
      xml.subtitle("Articles shared via NibbleRSS")
      xml.id("urn:uuid:#{@user.access_key}")
      xml.link(href: request.original_url, rel: "self", type: "application/atom+xml")
      xml.updated(@published_entries.first&.entry&.updated&.iso8601 || Time.current.iso8601)
      xml.generator("NibbleRSS")

      @published_entries.each do |user_entry|
        entry = user_entry.entry

        xml.entry do
          xml.title(entry.title)
          xml.link(href: entry.link, rel: "alternate", type: "text/html")
          xml.id("urn:uuid:#{user_entry.uuid}")
          xml.published(entry.date_entered.iso8601)
          xml.updated(entry.updated.iso8601)
          xml.author { xml.name(entry.author) } if entry.author.present?
          xml.content(entry.content, type: "html")

          # Include enclosures as links
          entry.enclosures.each do |enclosure|
            xml.link(
              href: enclosure.content_url,
              rel: "enclosure",
              type: enclosure.content_type,
              title: enclosure.title.presence,
              length: nil
            )
          end
        end
      end
    end
  end
end
