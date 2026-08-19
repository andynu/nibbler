# Identifies the build a running instance came from, so a deployed container can
# be matched back to a commit without shelling into it.
#
# Kamal injects KAMAL_VERSION (the full 40-character SHA) into every container it
# boots. That is the only source available in production: .dockerignore excludes
# /.git/, so the image carries no repository to interrogate. The git fallback
# below therefore only ever fires in development and test.
module AppVersion
  UNKNOWN = "unknown"
  SHORT_LENGTH = 7

  class << self
    # Full commit SHA, or UNKNOWN when neither source can supply one.
    def sha
      @sha ||= from_env || from_git || UNKNOWN
    end

    # Abbreviated SHA for display. Returns UNKNOWN unchanged rather than
    # truncating it to a meaningless fragment.
    def short
      known? ? sha[0, SHORT_LENGTH] : UNKNOWN
    end

    def known?
      sha != UNKNOWN
    end

    # The value is memoized for the life of the process, which is what we want in
    # production and what makes tests need this seam.
    def reset!
      @sha = nil
    end

    private

    def from_env
      ENV["KAMAL_VERSION"].presence
    end

    def from_git
      git_dir = Rails.root.join(".git")
      return nil unless git_dir.exist?

      # Array form, so there is no shell to inject into.
      output = IO.popen(
        [ "git", "--git-dir", git_dir.to_s, "rev-parse", "HEAD" ],
        err: File::NULL,
        &:read
      )
      return nil unless $?&.success?

      output.strip.presence
    rescue SystemCallError, IOError
      nil
    end
  end
end
