# Test-support endpoint for the Playwright suite.
#
# The E2E specs mutate as they run, so each example resets the database to the
# fixture set in E2eDataset before it starts. The route is only drawn when the
# server was booted with ALLOW_E2E_RESET=1 (see bin/e2e-server and
# config/routes.rb), and this controller re-checks the flag, so there is no way
# to reach it from a development or production boot.
#
# Inherits from ActionController::Base rather than ApplicationController so the
# `allow_browser versions: :modern` gate never applies: Playwright reaches this
# endpoint through an API request context, not a rendered page.
class E2eResetController < ActionController::Base
  skip_forgery_protection

  before_action :ensure_enabled

  # POST /e2e/reset
  def create
    E2eDataset.reseed!
    head :no_content
  end

  private

  def ensure_enabled
    head :not_found unless E2eDataset.enabled?
  end
end
