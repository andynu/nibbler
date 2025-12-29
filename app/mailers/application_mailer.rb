class ApplicationMailer < ActionMailer::Base
  default from: ENV.fetch("MAILER_FROM", "Nibbler <noreply@example.com>")
  layout "mailer"
end
