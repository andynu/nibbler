# Picks the articles for an edition of the morning paper: for each tag a user
# has marked include_in_paper, up to paper_limit of that user's entries tagged
# with it, and publishes them so the public feed carries them.
#
# A candidate entered within the window, has a usable fetched full text (the
# excerpt's word count says nothing about the article), and clears MIN_WORDS
# and MAX_LINK_DENSITY. Longest first, then fewest links.
#
# Tags are processed in name order and each entry is picked at most once, under
# the first tag that picks it; later tags take their next-best candidate. The
# pick is recorded in user_entries.paper_tag_id, which is what makes a rerun
# publish nothing new (the earlier picks fill the slots) and what keeps
# hand-published entries out of the count: a published row with no paper_tag is
# neither a candidate nor a slot.
class PaperSelection
  # One edition per week; config/initializers/good_job.rb schedules
  # PaperSelectionJob to match. Changing cadence means changing both.
  WINDOW = 7.days
  MIN_WORDS = 250
  MAX_LINK_DENSITY = 5.0

  # +candidates+ counts every eligible row, earlier picks included, so the
  # publishing rate per tag is visible in the log on every run.
  Result = Data.define(:tag, :candidates, :published)

  def self.run(window: WINDOW, now: Time.current)
    new(window: window, now: now).run
  end

  def initialize(window:, now:)
    @window = window
    @now = now
  end

  # @return [Array<Result>] one per marked tag, in processing order
  def run
    taken = Hash.new { |hash, user_id| hash[user_id] = Set.new }

    Tag.where(include_in_paper: true).order(:user_id, :name, :id).map do |tag|
      select_for(tag, taken[tag.user_id])
    end
  end

  private

  def select_for(tag, taken)
    rows = candidates(tag).to_a
    earlier, fresh = rows.partition { |row| row.paper_tag_id == tag.id }
    taken.merge(earlier.map(&:entry_id))

    open_slots = [ tag.paper_limit - earlier.size, 0 ].max
    picks = fresh.reject { |row| taken.include?(row.entry_id) }
                 .uniq(&:entry_id)
                 .first(open_slots)
    picks.each do |row|
      taken << row.entry_id
      publish(row, tag)
    end

    Result.new(tag: tag, candidates: rows.size, published: picks)
  end

  def publish(row, tag)
    UserEntry.transaction do
      row.update!(paper_tag: tag)
      row.publish!
    end
  end

  # The tag's earlier picks still in the window, plus the user's unpublished,
  # unpicked rows. A row whose entry the user already has published or picked
  # through another row (the same article arriving by two feeds) is left out.
  def candidates(tag)
    tag.user.user_entries
      .joins(:entry)
      .joins(full_text_join)
      .where(entry_id: EntryTag.where(tag_id: tag.id).select(:entry_id))
      .where(entries: { date_entered: (@now - @window)..@now })
      .where("entries.word_count >= ?", MIN_WORDS)
      .where("entries.link_density < ?", MAX_LINK_DENSITY)
      .where("user_entries.paper_tag_id = :tag OR (user_entries.paper_tag_id IS NULL AND NOT user_entries.published)", tag: tag.id)
      .where.not(entry_id: claimed_elsewhere)
      .includes(:entry)
      .order("entries.word_count DESC, entries.link_density ASC, user_entries.id ASC")
  end

  def full_text_join
    "INNER JOIN entry_full_texts ON entry_full_texts.entry_id = entries.id " \
      "AND #{format(Entry::USABLE_FULL_TEXT_SQL, full_text: 'entry_full_texts', entry: 'entries')}"
  end

  def claimed_elsewhere
    UserEntry.from("user_entries other")
      .where("other.user_id = user_entries.user_id AND other.entry_id = user_entries.entry_id")
      .where("other.id <> user_entries.id")
      .where("other.published OR other.paper_tag_id IS NOT NULL")
      .select("other.entry_id")
  end
end
