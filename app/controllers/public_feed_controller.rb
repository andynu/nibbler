require "builder"

# Serves public RSS/Atom feeds for published articles.
#
# Articles marked as "published" by a user become available through a public
# feed endpoint that requires only the user's access_key - no authentication.
# This allows sharing published articles with feed readers or other services.
class PublicFeedController < ActionController::Base
  before_action :find_user_by_access_key

  # How long a published entry waits for its full-text fetch to resolve before
  # it is listed with the feed's own body. Consumers ingest an entry once, so
  # listing it before the fetch lands would freeze the excerpt in place.
  TEXT_SETTLE_GRACE = 2.hours

  FULL_TEXT_JOIN_SQL =
    "LEFT JOIN entry_full_texts ON entry_full_texts.entry_id = entries.id".freeze

  # An entry is listed once its text has settled: a usable fetch, a failed fetch
  # with a feed body to fall back on, or the grace period passed with a feed
  # body. A NULL last_published predates that column being kept and counts as
  # past grace. An entry with neither a usable fetch nor a body is never listed.
  SETTLED_SQL = <<~SQL.squish.freeze
    (#{format(Entry::USABLE_FULL_TEXT_SQL, full_text: 'entry_full_texts', entry: 'entries')})
    OR (entries.content ~ '\\S' AND (
      entry_full_texts.status = '#{EntryFullText::FAILED}'
      OR user_entries.last_published IS NULL
      OR user_entries.last_published < :settled_before
    ))
  SQL

  # GET /public/feed/:access_key.atom
  def show
    @published_entries = @user.user_entries
      .published
      .joins(:entry)
      .joins(FULL_TEXT_JOIN_SQL)
      .where(SETTLED_SQL, settled_before: TEXT_SETTLE_GRACE.ago)
      .includes(entry: [ :enclosures, :entry_full_text ])
      .order(Arel.sql("user_entries.last_published DESC NULLS LAST, entries.date_entered DESC"))
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
          xml.content(entry.readable_content, type: "html")

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
