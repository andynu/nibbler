namespace :search do
  desc "Report how many entries are in the full-text index, and how they get there"
  task status: :environment do
    connection = Entry.connection
    column = Entry.columns_hash["tsvector_combined"]

    total = Entry.count
    indexed = Entry.where.not(tsvector_combined: nil).count
    empty = connection.select_value(
      "SELECT count(*) FROM entries WHERE tsvector_combined = ''::tsvector"
    ).to_i

    puts "database  : #{connection.pool.db_config.database}"
    puts "written by: #{column&.virtual? ? 'PostgreSQL (GENERATED ALWAYS ... STORED)' : 'nothing -- plain column, no generator'}"
    puts "total     : #{total}"
    puts "indexed   : #{indexed}"
    puts "unindexed : #{total - indexed}"
    puts "empty tsv : #{empty} (entries whose title and body hold no indexable words)"

    if total.positive? && indexed < total
      puts
      puts "#{total - indexed} entries have no tsvector and will never be returned by search."
      puts "If the column is generated, re-run db:migrate; a NULL there means the column"
      puts "is not generated in this database."
    end
  end
end
