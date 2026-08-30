# Nibbler

[![Personal Software](http://andynu.com/personalsoftware/badge.svg)](http://andynu.com/personalsoftware)

A modern RSS reader built with Rails and React.

## Development Setup

```bash
bundle install
npm install
bin/rails db:prepare
bin/dev
```

`db:prepare` rather than `db:create db:migrate`: development has two databases.
`ttrb_development` holds the application, and `ttrb_development_cable` holds the
Action Cable message table, loaded from `db/cable_schema.rb`. `db:prepare` walks
both; `db:migrate` only touches the primary.

`bin/dev` runs the whole stack from `Procfile.dev` -- Puma, the esbuild and
Tailwind watchers, and `bin/jobs`. Push notifications need all of it, because
`bin/jobs` is a separate process from Puma (see below), so running `bin/rails
server` alone gives you an app whose background work never happens.

## Real-time updates

The browser holds one websocket to `/cable`, authenticated by the same session
cookie the JSON API uses: `ApplicationCable::Connection` reads `user_id` out of
the encrypted session and refuses the connection when there isn't one.

Both development and production run GoodJob with `execution_mode :external`, so
jobs execute in `bin/jobs`, not in Puma. A broadcast therefore has to cross a
process boundary to reach a browser, and the cable adapter is what carries it:
`solid_cable`, writing to the cable database, polled by a listener thread in the
web process.

Development deliberately does not use the `async` adapter that `rails new`
configures. `async` is an in-process bus, so a broadcast from `bin/jobs` would be
accepted, find no subscriber in that process, and be dropped with no exception
and no log line. Development would look healthy and production would be silently
dead. Running the real adapter locally means that path is exercised on every
change instead of first running in production.

### Checking that push works

`HeartbeatChannel` exists for this. With `bin/dev` running and a browser signed
in, from another terminal:

```bash
bin/rails runner 'CableHeartbeatJob.perform_later(User.first.id)'
```

The job is enqueued by that process, performed by `bin/jobs`, and delivered to
the browser. In the browser console:

```js
document.documentElement.dataset.cable          // "connected"
document.documentElement.dataset.cableHeartbeatAt  // ISO timestamp of the last heartbeat
```

`data-cable` shows the subscription state at all times; `data-cable-heartbeat-at`
only appears once a message has arrived. If the first says `connected` and the
second never updates, the socket is fine and the broadcast is not arriving --
look at the cable database and the adapter, not at the browser.

### Connection pool

`config/database.yml` sizes the pool for the larger of two roles: the web role
is `RAILS_MAX_THREADS` **plus** `ACTION_CABLE_WORKER_POOL_SIZE`, and the job role
is `GOOD_JOB_MAX_THREADS` plus GoodJob's 2 utility threads. Action Cable belongs
in that sum because it runs connection and channel callbacks on its own thread
pool rather than on the Puma thread that served the upgrade, and each of those
threads can hold an Active Record connection. Raising either thread count
without the other leaves websocket handshakes timing out on connection checkout
while ordinary requests still look fine.

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
