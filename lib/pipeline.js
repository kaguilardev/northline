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
async function markQuoteAccepted(quoteId) {
  const db = require('../db');
  const q = (await db.query('SELECT request_id, client_id FROM nl_quotes WHERE id=$1', [quoteId])).rows[0];
  if (!q) return;
  if (q.request_id) await db.query(`UPDATE nl_requests SET status='accepted' WHERE id=$1`, [q.request_id]);
  if (q.client_id) await db.query(`UPDATE nl_clients SET status='scheduled', updated_at=now() WHERE id=$1 AND status = ANY($2)`, [q.client_id, PROSPECT]);
}

// Keep the client's status board in step with their job.
async function syncClientFromJob(clientId, jobStatus, jobDate) {
  if (!clientId || !jobDate) return;
  const db = require('../db');
  const clientStatus = { scheduled: 'scheduled', in_progress: 'in_progress', completed: 'completed' }[jobStatus];
  if (clientStatus) await db.query('UPDATE nl_clients SET status=$1, next_visit=$2, updated_at=now() WHERE id=$3', [clientStatus, jobStatus === 'completed' ? null : jobDate, clientId]);
}

module.exports = { syncClientFromJob, markQuoteAccepted, REQ_STAGES, REQ_STATUSES, ACTIVE, ARCHIVED, CLIENT_STATUSES, PROSPECT, CUSTOMER_STATUSES };
