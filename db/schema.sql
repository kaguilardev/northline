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
