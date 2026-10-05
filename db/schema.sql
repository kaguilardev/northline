-- Northline tables are prefixed nl_ so they never collide with tables
-- already in your training database.
CREATE TABLE IF NOT EXISTS nl_admins (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nl_clients (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  service       TEXT,
  status        TEXT NOT NULL DEFAULT 'lead'
                CHECK (status IN ('lead','quoted','scheduled','in_progress','completed','on_hold')),
  next_visit    DATE,
  notes         TEXT,
  email_opt_in  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nl_specials (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  discount    TEXT,
  starts_on   DATE,
  ends_on     DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nl_email_log (
  id          SERIAL PRIMARY KEY,
  subject     TEXT NOT NULL,
  recipients  INTEGER NOT NULL,
  special_id  INTEGER REFERENCES nl_specials(id) ON DELETE SET NULL,
  status      TEXT NOT NULL,
  sent_by     TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Login sessions (used by connect-pg-simple)
CREATE TABLE IF NOT EXISTS nl_session (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS nl_session_expire_idx ON nl_session (expire);

-- ── Estimate requests from the public website ──
CREATE TABLE IF NOT EXISTS nl_requests (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  service         TEXT,
  preferred_date  DATE,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','lead','quoted','accepted','lost')),
  client_id       INTEGER REFERENCES nl_clients(id) ON DELETE SET NULL,
  viewed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Upgrade older databases: request stages are now new → lead → quoted → accepted / lost
ALTER TABLE nl_requests ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
ALTER TABLE nl_requests DROP CONSTRAINT IF EXISTS nl_requests_status_check;
UPDATE nl_requests SET status='lead' WHERE status='contacted';
UPDATE nl_requests SET status='accepted' WHERE status='won';
ALTER TABLE nl_requests ADD CONSTRAINT nl_requests_status_check CHECK (status IN ('new','lead','quoted','accepted','lost'));
UPDATE nl_requests SET viewed_at=created_at WHERE viewed_at IS NULL AND status<>'new';
-- Commercial inquiries share the requests table
ALTER TABLE nl_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'residential';
ALTER TABLE nl_requests ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE nl_requests ADD COLUMN IF NOT EXISTS property_type TEXT;
ALTER TABLE nl_requests ADD COLUMN IF NOT EXISTS frequency TEXT;
-- Anyone who has accepted a quote is a customer, not a lead
UPDATE nl_clients c SET status='scheduled' WHERE status IN ('lead','quoted')
  AND EXISTS (SELECT 1 FROM nl_quotes q WHERE q.client_id=c.id AND q.status='accepted');

-- ── Quotes / estimates ──
CREATE TABLE IF NOT EXISTS nl_quotes (
  id           SERIAL PRIMARY KEY,
  number       TEXT UNIQUE,
  token        TEXT UNIQUE NOT NULL,
  client_id    INTEGER REFERENCES nl_clients(id) ON DELETE SET NULL,
  request_id   INTEGER REFERENCES nl_requests(id) ON DELETE SET NULL,
  title        TEXT,
  items        JSONB NOT NULL DEFAULT '[]',
  total        NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  paint_note   BOOLEAN NOT NULL DEFAULT false,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','sent','accepted','declined')),
  valid_until  DATE,
  sent_at      TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Jobs (work actually scheduled / done) ──
CREATE TABLE IF NOT EXISTS nl_jobs (
  id               SERIAL PRIMARY KEY,
  client_id        INTEGER REFERENCES nl_clients(id) ON DELETE SET NULL,
  quote_id         INTEGER REFERENCES nl_quotes(id) ON DELETE SET NULL,
  service          TEXT,
  package          TEXT,
  quoted_price     NUMERIC(10,2),
  materials_cost   NUMERIC(10,2),
  labor_hours      NUMERIC(6,2),
  employees        TEXT,
  job_date         DATE,
  status           TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  payment_status   TEXT NOT NULL DEFAULT 'unpaid'
                   CHECK (payment_status IN ('unpaid','deposit','paid')),
  actual_cost      NUMERIC(10,2),
  review_rating    INTEGER CHECK (review_rating BETWEEN 1 AND 5),
  customer_review  TEXT,
  show_in_gallery  BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Photos (stored in the database so they survive redeploys) ──
CREATE TABLE IF NOT EXISTS nl_photos (
  id          SERIAL PRIMARY KEY,
  owner_type  TEXT NOT NULL CHECK (owner_type IN ('request','job')),
  owner_id    INTEGER NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'upload' CHECK (kind IN ('upload','before','after')),
  filename    TEXT,
  mime        TEXT NOT NULL,
  bytes       INTEGER,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nl_photos_owner_idx ON nl_photos (owner_type, owner_id);

-- ── Emails sent to (and later received from) customers about a request ──
CREATE TABLE IF NOT EXISTS nl_messages (
  id          SERIAL PRIMARY KEY,
  request_id  INTEGER REFERENCES nl_requests(id) ON DELETE CASCADE,
  client_id   INTEGER REFERENCES nl_clients(id) ON DELETE SET NULL,
  direction   TEXT NOT NULL DEFAULT 'out' CHECK (direction IN ('out','in')),
  to_email    TEXT,
  from_email  TEXT,
  subject     TEXT,
  body        TEXT NOT NULL,
  sent_by     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nl_messages_request_idx ON nl_messages (request_id, created_at);

-- ── Job applications from the careers page ──
CREATE TABLE IF NOT EXISTS nl_applications (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  city           TEXT,
  position       TEXT,
  start_date     DATE,
  availability   TEXT,
  has_license    BOOLEAN NOT NULL DEFAULT false,
  has_transport  BOOLEAN NOT NULL DEFAULT false,
  experience     TEXT,
  resume_name    TEXT,
  resume_mime    TEXT,
  resume_data    BYTEA,
  status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','reviewing','interview','hired','declined')),
  notes          TEXT,
  viewed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
