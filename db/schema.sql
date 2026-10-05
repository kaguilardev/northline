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

-- ── Roles: owner (everything), admin (day-to-day office work), crew (own schedule only) ──
ALTER TABLE nl_admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE nl_admins DROP CONSTRAINT IF EXISTS nl_admins_role_check;
ALTER TABLE nl_admins ADD CONSTRAINT nl_admins_role_check CHECK (role IN ('owner','admin','crew'));
ALTER TABLE nl_admins ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE nl_admins ALTER COLUMN password_hash DROP NOT NULL; -- new team members set theirs from a sign-in link
ALTER TABLE nl_admins ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE nl_admins ADD COLUMN IF NOT EXISTS invite_token TEXT;
ALTER TABLE nl_admins ADD COLUMN IF NOT EXISTS invite_expires TIMESTAMPTZ;
ALTER TABLE nl_admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS nl_admins_invite_idx ON nl_admins (invite_token) WHERE invite_token IS NOT NULL;

-- ── Crew assigned to each job, and a start time for the schedule ──
ALTER TABLE nl_jobs ADD COLUMN IF NOT EXISTS start_time TIME;
CREATE TABLE IF NOT EXISTS nl_job_crew (
  job_id   INTEGER NOT NULL REFERENCES nl_jobs(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES nl_admins(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, user_id)
);
CREATE INDEX IF NOT EXISTS nl_job_crew_user_idx ON nl_job_crew (user_id);

-- ── Saved translations (DeepL), so each sentence is only translated once ──
CREATE TABLE IF NOT EXISTS nl_translations (
  lang        TEXT NOT NULL,
  formality   TEXT NOT NULL,
  hash        TEXT NOT NULL,
  source      TEXT NOT NULL,
  result      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lang, formality, hash)
);

-- ── Owner settings (business details, price book) ──
CREATE TABLE IF NOT EXISTS nl_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Security: sign-in attempts, blocked spam, blocked IPs ──
CREATE TABLE IF NOT EXISTS nl_auth_events (
  id          SERIAL PRIMARY KEY,
  event       TEXT NOT NULL,          -- login_ok, login_fail, locked, reset_request, password_set
  email       TEXT,
  user_id     INTEGER REFERENCES nl_admins(id) ON DELETE SET NULL,
  ip          TEXT,
  user_agent  TEXT,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nl_auth_events_recent_idx ON nl_auth_events (event, created_at DESC);
CREATE TABLE IF NOT EXISTS nl_spam_events (
  id          SERIAL PRIMARY KEY,
  form        TEXT NOT NULL,
  reason      TEXT NOT NULL,          -- honeypot, too_many, blocked_ip
  ip          TEXT,
  user_agent  TEXT,
  sample      TEXT,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nl_blocked_ips (
  ip          TEXT PRIMARY KEY,
  reason      TEXT,
  blocked_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── When each job was paid in full (revenue counts in that month) ──
ALTER TABLE nl_jobs ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
UPDATE nl_jobs SET paid_at = COALESCE(updated_at, now()) WHERE payment_status='paid' AND paid_at IS NULL;

-- ── One-time data fixes (run last, once every table exists) ──
-- Anyone who has accepted a quote is a customer, not a lead
UPDATE nl_clients c SET status='scheduled' WHERE status IN ('lead','quoted')
  AND EXISTS (SELECT 1 FROM nl_quotes q WHERE q.client_id=c.id AND q.status='accepted');
