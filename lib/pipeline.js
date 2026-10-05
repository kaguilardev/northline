// Stages an estimate request moves through. Accepted and lost requests are "archived".
const REQ_STAGES = [
  { key: 'new',      label: 'New',      hint: 'Just came in from the website' },
  { key: 'lead',     label: 'Lead',     hint: 'You’ve been in touch and it’s worth quoting' },
  { key: 'quoted',   label: 'Quoted',   hint: 'An estimate has been created or sent' },
  { key: 'accepted', label: 'Accepted', hint: 'Customer accepted — archived' },
  { key: 'lost',     label: 'Lost',     hint: 'Not moving forward — archived' },
];
const REQ_STATUSES = REQ_STAGES.map((s) => s.key);
const ACTIVE = ['new', 'lead', 'quoted'];
const ARCHIVED = ['accepted', 'lost'];

// Client statuses. "lead" and "quoted" clients are prospects still in the Requests pipeline,
// so the Clients tab hides them and only lists real customers.
const CLIENT_STATUSES = ['lead', 'quoted', 'scheduled', 'in_progress', 'completed', 'on_hold'];
const PROSPECT = ['lead', 'quoted'];
const CUSTOMER_STATUSES = CLIENT_STATUSES.filter((s) => !PROSPECT.includes(s));

// When a customer accepts: archive the request as accepted and make the prospect a customer.
// Best guess at the job's service type from what the customer asked for
function guessService(text) {
  const t = String(text || '').toLowerCase();
  if (/paint|cabinet|trim|drywall|accent/.test(t)) return 'Painting';
  if (/pressure|wash|driveway|patio clean/.test(t)) return 'Pressure Washing';
  if (/deck|fence|stain/.test(t)) return 'Decks & Fences';
  if (/remodel/.test(t)) return 'Remodeling';
  if (/leaf|cleanup|clean-up/.test(t)) return 'Yard Cleanup';
  if (/lawn|mow|refresh|curb|landscap|grounds/.test(t)) return 'Lawn Care';
  return null;
}

// Creates the job for an accepted quote (once). It starts without a date so it shows under "Needs a date".
async function createJobFromQuote(quoteId) {
  const db = require('../db');
  const q = (await db.query(`SELECT q.id, q.client_id, q.total, q.title, q.items, r.service AS requested
    FROM nl_quotes q LEFT JOIN nl_requests r ON r.id=q.request_id WHERE q.id=$1`, [quoteId])).rows[0];
  if (!q) return null;
  const existing = (await db.query('SELECT id FROM nl_jobs WHERE quote_id=$1 LIMIT 1', [q.id])).rows[0];
  if (existing) return existing.id;
  const first = (q.items || [])[0];
  const pkg = q.title || (first ? first.label : null);
  const { rows } = await db.query(`INSERT INTO nl_jobs (client_id, quote_id, service, package, quoted_price, status)
    VALUES ($1,$2,$3,$4,$5,'scheduled') RETURNING id`,
    [q.client_id, q.id, guessService([q.requested, q.title, ...(q.items || []).map((i) => i.label)].join(' ')), pkg, q.total]);
  return rows[0].id;
}

// When a customer accepts: archive the request as accepted, make the prospect a customer, and create the job.
async function markQuoteAccepted(quoteId) {
  const db = require('../db');
  const q = (await db.query('SELECT request_id, client_id FROM nl_quotes WHERE id=$1', [quoteId])).rows[0];
  if (!q) return;
  if (q.request_id) await db.query(`UPDATE nl_requests SET status='accepted' WHERE id=$1`, [q.request_id]);
  if (q.client_id) await db.query(`UPDATE nl_clients SET status='scheduled', updated_at=now() WHERE id=$1 AND status = ANY($2)`, [q.client_id, PROSPECT]);
  await createJobFromQuote(quoteId);
}

// One-time: quotes accepted before jobs were created automatically get their job now.
async function backfillAcceptedJobs() {
  const db = require('../db');
  await db.query('CREATE TABLE IF NOT EXISTS nl_migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = await db.query(`INSERT INTO nl_migrations (name) VALUES ('jobs-for-accepted-quotes') ON CONFLICT DO NOTHING RETURNING name`);
  if (!done.rows[0]) return; // already ran once — never re-create jobs someone deleted on purpose
  const { rows } = await db.query(`SELECT id FROM nl_quotes q WHERE status='accepted' AND NOT EXISTS (SELECT 1 FROM nl_jobs j WHERE j.quote_id=q.id)`);
  for (const r of rows) await createJobFromQuote(r.id);
  if (rows.length) console.log(`Created ${rows.length} job(s) for previously accepted quotes.`);
}

// Keep the client's status board in step with their job.
async function syncClientFromJob(clientId, jobStatus, jobDate) {
  if (!clientId || !jobDate) return;
  const db = require('../db');
  const clientStatus = { scheduled: 'scheduled', in_progress: 'in_progress', completed: 'completed' }[jobStatus];
  if (clientStatus) await db.query('UPDATE nl_clients SET status=$1, next_visit=$2, updated_at=now() WHERE id=$3', [clientStatus, jobStatus === 'completed' ? null : jobDate, clientId]);
}

module.exports = { syncClientFromJob, markQuoteAccepted, createJobFromQuote, backfillAcceptedJobs, REQ_STAGES, REQ_STATUSES, ACTIVE, ARCHIVED, CLIENT_STATUSES, PROSPECT, CUSTOMER_STATUSES };
