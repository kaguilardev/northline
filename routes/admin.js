const express = require('express');
const db = require('../db');
const { requireAdmin, verifyLogin, findInvite, acceptInvite, issueInvite, STAFF } = require('../lib/auth');
const { sendMessage, enabled: emailEnabled } = require('../lib/email');
const { baseUrl } = require('./public');

const REMEMBER_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_MS = 1000 * 60 * 60 * 12;
const specials = require('../lib/specials');
const { sendBulk, renderEmail } = require('../lib/email');
const { CLIENT_STATUSES: STATUSES, CUSTOMER_STATUSES, PROSPECT, REQ_STAGES } = require('../lib/pipeline');

const router = express.Router();

// ---------- Login ----------
const homeFor = (u) => (STAFF.includes(u.role) ? '/admin' : '/crew');

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(homeFor(req.session.user));
  res.render('login', { error: null, email: '' });
});

router.post('/login', async (req, res, next) => {
  try {
    const { email = '', password = '' } = req.body;
    const user = await verifyLogin(email.trim(), password);
    if (!user) return res.status(401).render('login', { error: 'That email and password don\'t match.', email });
    // Only send people back to a page their role can open
    const wanted = req.session.returnTo || '';
    const returnTo = wanted.startsWith(homeFor(user)) ? wanted : homeFor(user);
    const remember = req.body.remember === 'on';
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = user;
      req.session.cookie.maxAge = remember ? REMEMBER_MS : SESSION_MS;
      res.redirect(returnTo);
    });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------- Forgot password: email a one-hour reset link ----------
// Same answer whether or not the email exists, so this page can't be used to find out who's on the team.
const resetTries = new Map(); // ip -> [timestamps]
function tooManyResets(ip) {
  const now = Date.now(), recent = (resetTries.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  recent.push(now); resetTries.set(ip, recent);
  if (resetTries.size > 5000) resetTries.clear(); // keep memory bounded
  return recent.length > 5;
}

router.get('/forgot', (req, res) => res.render('forgot', { sent: false, email: '', emailOn: emailEnabled() }));

router.post('/forgot', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
    const done = () => res.render('forgot', { sent: true, email, emailOn: emailEnabled() });
    if (!email || tooManyResets(req.ip)) return done();
    const u = (await db.query(`SELECT id, name, email, active, invite_expires FROM nl_admins WHERE lower(email)=$1`, [email])).rows[0];
    // one email per account every 5 minutes
    if (!u || !u.active || (u.invite_expires && new Date(u.invite_expires) - Date.now() > 55 * 60 * 1000)) return done();
    const link = `${baseUrl(req)}/invite/${await issueInvite(u.id, 1)}`;
    if (emailEnabled()) {
      sendMessage({ to: u.email, name: u.name, subject: 'Reset your Northline password', baseUrl: baseUrl(req),
        body: `Someone (hopefully you) asked to reset your Northline password.\n\nChoose a new one here — the link works once and expires in 1 hour:\n${link}\n\nDidn’t ask for this? You can ignore this email; your password hasn’t changed.` })
        .catch((e) => console.error('reset email failed:', e.message));
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`\n  [dev] Email is off, so here is the reset link for ${u.email}:\n  ${link}\n`);
    }
    done();
  } catch (e) { next(e); }
});

// ---------- Set a password from an invite / reset link ----------
router.get('/invite/:token', async (req, res, next) => {
  try {
    const u = await findInvite(req.params.token);
    res.render('invite', { u, token: req.params.token, error: null });
  } catch (e) { next(e); }
});

router.post('/invite/:token', async (req, res, next) => {
  try {
    const u = await findInvite(req.params.token);
    const { password = '', confirm = '' } = req.body;
    const fail = (error) => res.status(400).render('invite', { u, token: req.params.token, error });
    if (!u) return fail(null);
    if (password.length < 10) return fail('Use at least 10 characters.');
    if (password !== confirm) return fail('The two passwords don’t match.');
    const user = await acceptInvite(req.params.token, password);
    if (!user) return fail(null);
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = user;
      res.redirect(homeFor(user));
    });
  } catch (e) { next(e); }
});

// Everything below needs an admin login
router.use('/admin', requireAdmin);

// ---------- Dashboard ----------
router.get('/admin', async (req, res, next) => {
  try {
    const counts = await db.query(`SELECT status, count(*)::int AS n FROM nl_clients GROUP BY status`);
    const byStatus = Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0]));
    counts.rows.forEach((r) => { if (r.status in byStatus) byStatus[r.status] = r.n; });
    const reqCounts = await db.query(`SELECT status, count(*)::int AS n FROM nl_requests GROUP BY status`);
    const pipeline = REQ_STAGES.filter((s) => ['new', 'lead', 'quoted'].includes(s.key)).map((s) => ({ ...s, n: 0 }));
    reqCounts.rows.forEach((r) => { const st = pipeline.find((p) => p.key === r.status); if (st) st.n = r.n; });
    const [kpi, upcoming, requests, byService] = await Promise.all([
      db.query(`SELECT
        (SELECT count(*)::int FROM nl_requests WHERE status='new') AS new_requests,
        (SELECT count(*)::int FROM nl_quotes WHERE status='sent') AS open_quotes,
        (SELECT COALESCE(sum(total),0) FROM nl_quotes WHERE status='sent') AS open_value,
        (SELECT COALESCE(sum(quoted_price),0) FROM nl_jobs WHERE status='completed' AND date_trunc('month', job_date)=date_trunc('month', current_date)) AS month_revenue,
        (SELECT COALESCE(sum(quoted_price - actual_cost),0) FROM nl_jobs WHERE status='completed' AND actual_cost IS NOT NULL AND date_trunc('month', job_date)=date_trunc('month', current_date)) AS month_profit,
        (SELECT COALESCE(sum(quoted_price),0) FROM nl_jobs WHERE status='completed' AND payment_status<>'paid') AS unpaid`),
      db.query(`SELECT j.id, j.job_date, j.service, j.package, j.employees, c.name FROM nl_jobs j LEFT JOIN nl_clients c ON c.id=j.client_id
        WHERE j.status IN ('scheduled','in_progress') AND (j.job_date IS NULL OR j.job_date >= current_date - 1) ORDER BY j.job_date NULLS LAST LIMIT 8`),
      db.query(`SELECT id, name, service, created_at, viewed_at FROM nl_requests WHERE status='new' ORDER BY created_at DESC LIMIT 6`),
      db.query(`SELECT COALESCE(service,'Other') AS service, count(*)::int AS jobs, COALESCE(sum(quoted_price),0) AS revenue,
        COALESCE(sum(quoted_price - actual_cost) FILTER (WHERE actual_cost IS NOT NULL),0) AS profit,
        COALESCE(sum(labor_hours),0) AS hours
        FROM nl_jobs WHERE status='completed' GROUP BY 1 ORDER BY profit DESC`),
    ]);
    res.render('dashboard', { byStatus, pipeline, k: kpi.rows[0], upcoming: upcoming.rows, requests: requests.rows, byService: byService.rows });
  } catch (e) { next(e); }
});

// ---------- Clients ----------
router.get('/admin/clients', async (req, res, next) => {
  try {
    const { q = '', status = '' } = req.query;
    const prospects = req.query.prospects === '1';
    const params = [];
    const where = [];
    if (q) { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR address ILIKE $${params.length})`); }
    if (STATUSES.includes(status)) { params.push(status); where.push(`status = $${params.length}`); }
    // Prospects (lead / quoted) belong to the Requests pipeline, not the customer list
    else { params.push(PROSPECT); where.push(`${prospects ? '' : 'NOT '}(status = ANY($${params.length}))`); }
    const { rows } = await db.query(
      `SELECT * FROM nl_clients ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`, params);
    const prospectCount = (await db.query(`SELECT count(*)::int AS n FROM nl_clients WHERE status = ANY($1)`, [PROSPECT])).rows[0].n;
    res.render('clients', { clients: rows, q, status, prospects, prospectCount, statuses: CUSTOMER_STATUSES });
  } catch (e) { next(e); }
});

router.get('/admin/clients/new', (req, res) => res.render('client-form', { customer: { status: 'scheduled' }, error: null }));

router.get('/admin/clients/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM nl_clients WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).render('error', { message: 'Client not found.' });
    const quotes = (await db.query('SELECT id, number, title, total, status FROM nl_quotes WHERE client_id=$1 ORDER BY id DESC', [rows[0].id])).rows;
    const jobs = (await db.query('SELECT id, job_date, service, package, status, quoted_price FROM nl_jobs WHERE client_id=$1 ORDER BY job_date DESC NULLS FIRST', [rows[0].id])).rows;
    res.render('client-form', { customer: rows[0], error: null, quotes, jobs });
  } catch (e) { next(e); }
});

function clientFields(b) {
  return [b.name?.trim(), b.email?.trim() || null, b.phone?.trim() || null, b.address?.trim() || null,
    b.service?.trim() || null, STATUSES.includes(b.status) ? b.status : 'scheduled', b.next_visit || null,
    b.notes?.trim() || null, b.email_opt_in === 'on'];
}

router.post('/admin/clients', async (req, res, next) => {
  try {
    if (!req.body.name?.trim()) return res.render('client-form', { customer: req.body, error: 'Name is required.' });
    await db.query(
      `INSERT INTO nl_clients (name,email,phone,address,service,status,next_visit,notes,email_opt_in)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, clientFields(req.body));
    res.redirect('/admin/clients');
  } catch (e) { next(e); }
});

router.post('/admin/clients/:id', async (req, res, next) => {
  try {
    if (!req.body.name?.trim()) return res.render('client-form', { customer: { ...req.body, id: req.params.id }, error: 'Name is required.' });
    await db.query(
      `UPDATE nl_clients SET name=$1,email=$2,phone=$3,address=$4,service=$5,status=$6,next_visit=$7,notes=$8,
       email_opt_in=$9, updated_at=now() WHERE id=$10`, [...clientFields(req.body), req.params.id]);
    res.redirect('/admin/clients');
  } catch (e) { next(e); }
});

router.post('/admin/clients/:id/delete', async (req, res, next) => {
  try {
    await db.query('DELETE FROM nl_clients WHERE id = $1', [req.params.id]);
    res.redirect('/admin/clients');
  } catch (e) { next(e); }
});

// ---------- Specials ----------
router.get('/admin/specials', async (req, res, next) => {
  try {
    const { season = specials.seasonFor(), service = '', end = '' } = req.query;
    const ideas = specials.generate({ season, service, endDate: end });
    const saved = await db.query('SELECT * FROM nl_specials ORDER BY created_at DESC');
    res.render('specials', { ideas, saved: saved.rows, season, service, end, seasons: specials.SEASONS });
  } catch (e) { next(e); }
});

router.post('/admin/specials', async (req, res, next) => {
  try {
    const { title, body, discount, starts_on, ends_on } = req.body;
    if (!title?.trim() || !body?.trim()) return res.redirect('/admin/specials');
    await db.query(
      `INSERT INTO nl_specials (title, body, discount, starts_on, ends_on) VALUES ($1,$2,$3,$4,$5)`,
      [title.trim(), body.trim(), discount || null, starts_on || null, ends_on || null]);
    res.redirect('/admin/specials');
  } catch (e) { next(e); }
});

router.post('/admin/specials/:id/delete', async (req, res, next) => {
  try {
    await db.query('DELETE FROM nl_specials WHERE id = $1', [req.params.id]);
    res.redirect('/admin/specials');
  } catch (e) { next(e); }
});

// ---------- Email ----------
async function audience(statusFilter) {
  const params = [];
  let sql = `SELECT name, email FROM nl_clients WHERE email_opt_in AND email IS NOT NULL AND email <> ''`;
  if (STATUSES.includes(statusFilter)) { params.push(statusFilter); sql += ` AND status = $1`; }
  return (await db.query(sql, params)).rows;
}

router.get('/admin/email', async (req, res, next) => {
  try {
    const saved = await db.query('SELECT * FROM nl_specials ORDER BY created_at DESC');
    let draft = { subject: '', heading: '', body: '', special_id: '' };
    if (req.query.special) {
      const s = saved.rows.find((r) => String(r.id) === req.query.special);
      if (s) draft = { subject: `${s.title}${s.discount ? ' — ' + s.discount : ''}`, heading: s.title, body: s.body, special_id: s.id };
    }
    const all = await audience('');
    res.render('email', { saved: saved.rows, draft, audienceCount: all.length, result: null, statuses: STATUSES,
      sendingEnabled: !!process.env.RESEND_API_KEY });
  } catch (e) { next(e); }
});

router.post('/admin/email/preview', (req, res) => {
  const { heading = '', body = '' } = req.body;
  res.send(renderEmail({ heading, body, clientName: 'Alex Sample' }));
});

router.post('/admin/email', async (req, res, next) => {
  try {
    const { subject, heading, body, audience: aud = '', special_id } = req.body;
    const recipients = await audience(aud);
    const result = await sendBulk({ subject, heading: heading || subject, body, recipients });
    await db.query(
      `INSERT INTO nl_email_log (subject, recipients, special_id, status, sent_by) VALUES ($1,$2,$3,$4,$5)`,
      [subject, result.sent, special_id || null, result.preview ? 'preview' : (result.errors.length ? 'partial' : 'sent'), req.session.user.email]);
    const saved = await db.query('SELECT * FROM nl_specials ORDER BY created_at DESC');
    const all = await audience('');
    res.render('email', { saved: saved.rows, draft: req.body, audienceCount: all.length, statuses: STATUSES,
      result: { ...result, total: recipients.length }, sendingEnabled: !!process.env.RESEND_API_KEY });
  } catch (e) { next(e); }
});

module.exports = router;
