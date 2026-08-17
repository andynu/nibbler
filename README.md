# Nibbler

[![Personal Software](http://andynu.com/personalsoftware/badge.svg)](http://andynu.com/personalsoftware)

A modern RSS reader built with Rails and React.

## Development Setup

```bash
bundle install
npm install
bin/rails db:create db:migrate
bin/dev
```

## Email Configuration

### Development

Uses [letter_opener](https://github.com/ryanb/letter_opener) - emails open in browser instead of being sent.

### Production

Configure email delivery via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | Yes | - | SMTP server address |
| `SMTP_PORT` | No | 587 | SMTP server port |
| `SMTP_USERNAME` | No | - | SMTP authentication username |
| `SMTP_PASSWORD` | No | - | SMTP authentication password |
| `SMTP_AUTH` | No | plain | Authentication type (plain, login, cram_md5) |
| `SMTP_STARTTLS` | No | true | Enable STARTTLS |
| `APP_HOST` | No | localhost | Application hostname for email links |
| `APP_PROTOCOL` | No | https | Protocol for email links (http or https) |
| `MAILER_FROM` | No | Nibbler &lt;noreply@example.com&gt; | Default sender address |

If `SMTP_HOST` is not set, email delivery is disabled.

## Testing

```bash
# Rails tests
bundle exec rails test

# Frontend component tests
npm run test

# E2E tests
npm run test:e2e
```

The E2E run starts its own server on port 3001 via `bin/e2e-server`, against a
`ttrb_e2e` database it seeds itself. It does not touch a running `bin/dev` or
the Minitest database, and it makes no outbound network requests. See
[docs/playwright-testing-guide.md](docs/playwright-testing-guide.md).
