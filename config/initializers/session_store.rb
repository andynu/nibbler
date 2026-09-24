# The cookie is rewritten on every request, so expire_after is an idle limit:
# a session ends after two weeks with no requests, not two weeks after login.
# The expiry is also sealed inside the encrypted cookie, so a copy replayed
# after it lapses is refused even if the browser kept it.
Rails.application.config.session_store :cookie_store,
  key: "_ttrb_session",
  expire_after: 2.weeks
