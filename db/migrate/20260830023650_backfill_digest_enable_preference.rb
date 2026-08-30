# Move the digest opt-in from users.email_digest to the digest_enable preference.
#
# SendDigestsJob selected on users.email_digest, but no endpoint ever wrote that
# column: the "Send daily digest" switch writes the digest_enable preference, and
# nothing on the server read it. The switch was inert in both directions. The job
# now reads digest_enable, alongside digest_preferred_time, digest_catchup and
# digest_min_score, so all four digest settings come from one place.
#
# Without this backfill, any user already opted in through the column would go
# quiet the moment the new job code starts running, which is the one outcome
# this change must not produce. That is why the copy is here and not in a rake
# task: it has to land with the deploy, not whenever someone remembers to run
# it. (Deploy order is safe either way. Migrations run before the restart, so
# the rows exist before the new code reads them; and if the code goes first, the
# old column-based gate is still what is selecting until migrate finishes.)
#
# Users who have already set digest_enable keep what they set -- ON CONFLICT DO
# NOTHING, so someone who turned the switch off is not re-subscribed by their
# stale column. Nothing here writes to the users table, so email_digest,
# last_digest_sent and every other column are left exactly as they are. The
# column itself stays for now and is dropped in a later deploy.
#
# Re-running the migration inserts nothing: every row it would write already
# exists and is skipped by the same conflict clause. A run interrupted partway
# rolls back inside its own transaction, and starting over reaches the same
# state.
class BackfillDigestEnablePreference < ActiveRecord::Migration[8.1]
  def up
    execute(<<~SQL.squish)
      INSERT INTO user_preferences (pref_name, user_id, value)
      SELECT 'digest_enable', users.id, 'true'
      FROM users
      WHERE users.email_digest = TRUE
      ON CONFLICT (pref_name, user_id) DO NOTHING
    SQL
  end

  def down
    # Deliberately not reversed. A digest_enable row written here is
    # indistinguishable from one the user wrote themselves through the settings
    # panel, so deleting them on rollback would silently unsubscribe people who
    # had opted in by hand. Rolling back the code is enough: the old job reads
    # users.email_digest, which this migration never touched.
  end
end
