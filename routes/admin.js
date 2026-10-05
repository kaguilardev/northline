const express = require('express');
const db = require('../db');
const { requireAdmin, verifyLogin } = require('../lib/auth');
const specials = require('../lib/specials');
const { sendBulk, renderEmail } = require('../lib/email');

const router = express.Router();
const STATUSES = ['lead', 'quoted', 'scheduled', 'in_progress', 'completed', 'on_hold'];

// ---------- Login ----------
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('login', { error: null, email: '' });
});

router.post('/login', async (req, res, next) => {
  try {
    const { email = '', password = '' } = req.body;
    const admin = await verifyLogin(email.trim(), password);
    if (!admin) return res.status(401).render('login', { error: 'That email and password don\'t match.', email });
    const returnTo = req.session.returnTo || '/admin';
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.admin = admin;
      res.redirect(returnTo);
    });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Everything below needs an admin login
router.use('/admin', requireAdmin);

// ---------- Dashboard ----------
router.get('/admin', async (req, res, next) => {
  try {
    const counts = await db.query(`SELECT status, count(*)::int AS n FROM nl_clients GROUP BY status`);
    const upcoming = await db.query(
      `SELECT id, name, service, next_visit, status FROM nl_clients
       WHERE next_visit >= current_date ORDER BY next_visit LIMIT 8`);
    const recentEmails = await db.query(`SELECT * FROM nl_email_log ORDER BY sent_at DESC LIMIT 5`);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    counts.rows.forEach((r) => { byStatus[r.status] = r.n; });
    res.render('dashboard', { byStatus, upcoming: upcoming.rows, recentEmails: recentEmails.rows });
  } catch (e) { next(e); }
});

// ---------- Clients ----------
router.get('/admin/clients', async (req, res, next) => {
  try {
    const { q = '', status = '' } = req.query;
    const params = [];
    const where = [];
    if (q) { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR address ILIKE $${params.length})`); }
    if (STATUSES.includes(status)) { params.push(status); where.push(`status = $${params.length}`); }
    const { rows } = await db.query(
      `SELECT * FROM nl_clients ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`, params);
    res.render('clients', { clients: rows, q, status });
  } catch (e) { next(e); }
});

router.get('/admin/clients/new', (req, res) => res.render('client-form', { client: {}, error: null }));

router.get('/admin/clients/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM nl_clients WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).render('error', { message: 'Client not found.' });
    res.render('client-form', { client: rows[0], error: null });
  } catch (e) { next(e); }
});

function clientFields(b) {
  return [b.name?.trim(), b.email?.trim() || null, b.phone?.trim() || null, b.address?.trim() || null,
    b.service?.trim() || null, STATUSES.includes(b.status) ? b.status : 'lead', b.next_visit || null,
    b.notes?.trim() || null, b.email_opt_in === 'on'];
}

router.post('/admin/clients', async (req, res, next) => {
  try {
    if (!req.body.name?.trim()) return res.render('client-form', { client: req.body, error: 'Name is required.' });
    await db.query(
      `INSERT INTO nl_clients (name,email,phone,address,service,status,next_visit,notes,email_opt_in)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, clientFields(req.body));
    res.redirect('/admin/clients');
  } catch (e) { next(e); }
});

router.post('/admin/clients/:id', async (req, res, next) => {
  try {
    if (!req.body.name?.trim()) return res.render('client-form', { client: { ...req.body, id: req.params.id }, error: 'Name is required.' });
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
      [subject, result.sent, special_id || null, result.preview ? 'preview' : (result.errors.length ? 'partial' : 'sent'), req.session.admin.email]);
    const saved = await db.query('SELECT * FROM nl_specials ORDER BY created_at DESC');
    const all = await audience('');
    res.render('email', { saved: saved.rows, draft: req.body, audienceCount: all.length, statuses: STATUSES,
      result: { ...result, total: recipients.length }, sendingEnabled: !!process.env.RESEND_API_KEY });
  } catch (e) { next(e); }
});

module.exports = router;
