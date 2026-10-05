// Admin tools: estimate requests, quotes and jobs.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const pricing = require('../lib/pricing');
const { requireAdmin } = require('../lib/auth');
const { upload, savePhotos, listPhotos } = require('../lib/photos');
const { sendQuote, enabled: emailEnabled } = require('../lib/email');
const { baseUrl } = require('./public');

const router = express.Router();
router.use('/admin', requireAdmin);

const REQ_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];
const JOB_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const PAY_STATUSES = ['unpaid', 'deposit', 'paid'];
const SERVICE_TYPES = ['Lawn Care', 'Yard Cleanup', 'Pressure Washing', 'Painting', 'Remodeling', 'Decks & Fences', 'Other'];
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

async function clientsList() {
  return (await db.query('SELECT id, name, email, phone, address FROM nl_clients ORDER BY name')).rows;
}

// Find a client by email (or create one) from request / form data.
async function upsertClient({ name, email, phone, address, service }) {
  if (email) {
    const found = await db.query('SELECT id FROM nl_clients WHERE lower(email)=lower($1) LIMIT 1', [email]);
    if (found.rows[0]) return found.rows[0].id;
  }
  const { rows } = await db.query(
    `INSERT INTO nl_clients (name, email, phone, address, service, status) VALUES ($1,$2,$3,$4,$5,'lead') RETURNING id`,
    [name, email || null, phone || null, address || null, service || null]);
  return rows[0].id;
}

// ═════════ Estimate requests ═════════
router.get('/admin/requests', async (req, res, next) => {
  try {
    const status = REQ_STATUSES.includes(req.query.status) ? req.query.status : '';
    const { rows } = await db.query(`
      SELECT r.*, (SELECT count(*)::int FROM nl_photos p WHERE p.owner_type='request' AND p.owner_id=r.id) AS photo_count
      FROM nl_requests r ${status ? 'WHERE r.status=$1' : ''} ORDER BY r.created_at DESC`, status ? [status] : []);
    res.render('admin/requests', { title: 'Requests', requests: rows, status, statuses: REQ_STATUSES });
  } catch (e) { next(e); }
});

router.get('/admin/requests/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM nl_requests WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).render('error', { message: 'Request not found.' });
    const photos = await listPhotos('request', rows[0].id);
    const quotes = (await db.query('SELECT id, number, total, status FROM nl_quotes WHERE request_id=$1 ORDER BY id DESC', [rows[0].id])).rows;
    res.render('admin/request', { title: rows[0].name, r: rows[0], photos, quotes, statuses: REQ_STATUSES });
  } catch (e) { next(e); }
});

router.post('/admin/requests/:id/status', async (req, res, next) => {
  try {
    if (REQ_STATUSES.includes(req.body.status)) await db.query('UPDATE nl_requests SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
    res.redirect(`/admin/requests/${req.params.id}`);
  } catch (e) { next(e); }
});

router.post('/admin/requests/:id/delete', async (req, res, next) => {
  try {
    await db.query(`DELETE FROM nl_photos WHERE owner_type='request' AND owner_id=$1`, [req.params.id]);
    await db.query('DELETE FROM nl_requests WHERE id=$1', [req.params.id]);
    res.redirect('/admin/requests');
  } catch (e) { next(e); }
});

// ═════════ Quotes ═════════
router.get('/admin/quotes', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT q.*, c.name AS client_name FROM nl_quotes q LEFT JOIN nl_clients c ON c.id=q.client_id ORDER BY q.created_at DESC`);
    res.render('admin/quotes', { title: 'Quotes', quotes: rows });
  } catch (e) { next(e); }
});

function priceBook() {
  const { LAWN_SIZES, LAWN_PACKAGES, OUTDOOR_ADDONS, LAWN_ADJUSTMENTS, PAINT_PACKAGES, PAINT_ADDONS } = pricing;
  return { LAWN_SIZES, LAWN_PACKAGES, OUTDOOR_ADDONS, LAWN_ADJUSTMENTS, PAINT_PACKAGES, PAINT_ADDONS };
}

router.get('/admin/quotes/new', async (req, res, next) => {
  try {
    const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    let quote = { items: [], valid_until: valid, client_id: req.query.client || '', title: '' };
    let fromRequest = null;
    if (req.query.request) {
      const r = (await db.query('SELECT * FROM nl_requests WHERE id=$1', [req.query.request])).rows[0];
      if (r) {
        fromRequest = r;
        quote.request_id = r.id;
        quote.title = r.service;
        quote.client_id = r.client_id || '';
        if (!quote.client_id && r.email) {
          const c = (await db.query('SELECT id FROM nl_clients WHERE lower(email)=lower($1) LIMIT 1', [r.email])).rows[0];
          if (c) quote.client_id = c.id;
        }
      }
    }
    res.render('admin/quote-form', { title: 'New quote', quote, fromRequest, clients: await clientsList(), book: priceBook(), error: null });
  } catch (e) { next(e); }
});

router.get('/admin/quotes/:id/edit', async (req, res, next) => {
  try {
    const quote = (await db.query('SELECT * FROM nl_quotes WHERE id=$1', [req.params.id])).rows[0];
    if (!quote) return res.status(404).render('error', { message: 'Quote not found.' });
    if (quote.valid_until) quote.valid_until = new Date(quote.valid_until).toISOString().slice(0, 10);
    res.render('admin/quote-form', { title: 'Edit quote', quote, fromRequest: null, clients: await clientsList(), book: priceBook(), error: null });
  } catch (e) { next(e); }
});

function parseItems(raw) {
  let items = [];
  try { items = JSON.parse(raw || '[]'); } catch { items = []; }
  return items
    .map((i) => ({ label: String(i.label || '').trim().slice(0, 200), detail: String(i.detail || '').trim().slice(0, 300), amount: Math.round(Number(i.amount) * 100) / 100 }))
    .filter((i) => i.label && !isNaN(i.amount));
}

async function saveQuote(req, id) {
  const b = req.body;
  const items = parseItems(b.items);
  const total = items.reduce((s, i) => s + i.amount, 0);
  let clientId = num(b.client_id);
  if (!clientId && b.new_name && b.new_name.trim()) {
    clientId = await upsertClient({ name: b.new_name.trim(), email: b.new_email, phone: b.new_phone, address: b.new_address, service: b.title });
  }
  const vals = [clientId, num(b.request_id), (b.title || '').trim() || null, JSON.stringify(items), total,
    (b.notes || '').trim() || null, b.paint_note === 'on', b.valid_until || null];
  if (id) {
    await db.query(`UPDATE nl_quotes SET client_id=$1, request_id=$2, title=$3, items=$4, total=$5, notes=$6, paint_note=$7, valid_until=$8, updated_at=now() WHERE id=$9`, [...vals, id]);
    return id;
  }
  const token = crypto.randomBytes(18).toString('base64url');
  const { rows } = await db.query(
    `INSERT INTO nl_quotes (client_id, request_id, title, items, total, notes, paint_note, valid_until, token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [...vals, token]);
  const newId = rows[0].id;
  await db.query(`UPDATE nl_quotes SET number=$1 WHERE id=$2`, [`NL-${new Date().getFullYear()}-${String(newId).padStart(4, '0')}`, newId]);
  if (vals[1]) {
    await db.query(`UPDATE nl_requests SET status=CASE WHEN status IN ('new','contacted') THEN 'quoted' ELSE status END, client_id=COALESCE(client_id,$1) WHERE id=$2`, [clientId, vals[1]]);
  }
  return newId;
}

router.post('/admin/quotes', async (req, res, next) => {
  try { res.redirect(`/admin/quotes/${await saveQuote(req)}`); } catch (e) { next(e); }
});
router.post('/admin/quotes/:id', async (req, res, next) => {
  try { res.redirect(`/admin/quotes/${await saveQuote(req, req.params.id)}`); } catch (e) { next(e); }
});

async function loadQuote(id) {
  return (await db.query(`
    SELECT q.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone, c.address AS client_address
    FROM nl_quotes q LEFT JOIN nl_clients c ON c.id=q.client_id WHERE q.id=$1`, [id])).rows[0];
}

router.get('/admin/quotes/:id', async (req, res, next) => {
  try {
    const quote = await loadQuote(req.params.id);
    if (!quote) return res.status(404).render('error', { message: 'Quote not found.' });
    const job = (await db.query('SELECT id FROM nl_jobs WHERE quote_id=$1 LIMIT 1', [quote.id])).rows[0];
    res.render('admin/quote', { title: quote.number, quote, job, link: `${baseUrl(req)}/q/${quote.token}`,
      emailEnabled: emailEnabled(), flash: req.query.flash || null });
  } catch (e) { next(e); }
});

router.post('/admin/quotes/:id/send', async (req, res, next) => {
  try {
    const quote = await loadQuote(req.params.id);
    if (!quote) return res.redirect('/admin/quotes');
    await db.query(`UPDATE nl_quotes SET status=CASE WHEN status='draft' THEN 'sent' ELSE status END, sent_at=COALESCE(sent_at, now()) WHERE id=$1`, [quote.id]);
    const link = `${baseUrl(req)}/q/${quote.token}`;
    let flash = 'Marked as sent. Copy the link below and text or email it to your customer.';
    if (req.body.via === 'email') {
      if (!quote.client_email) flash = 'This client has no email address — add one on their client page, or copy the link instead.';
      else {
        try {
          const r = await sendQuote({ quote, to: quote.client_email, name: quote.client_name, link, baseUrl: baseUrl(req) });
          flash = r.preview ? 'Email sending is off (no RESEND_API_KEY). Marked as sent — copy the link instead.' : `Estimate emailed to ${quote.client_email}.`;
        } catch (e) { flash = `Email failed: ${e.message}`; }
      }
    }
    res.redirect(`/admin/quotes/${quote.id}?flash=${encodeURIComponent(flash)}`);
  } catch (e) { next(e); }
});

router.post('/admin/quotes/:id/status', async (req, res, next) => {
  try {
    if (['draft', 'sent', 'accepted', 'declined'].includes(req.body.status)) {
      await db.query('UPDATE nl_quotes SET status=$1, updated_at=now() WHERE id=$2', [req.body.status, req.params.id]);
    }
    res.redirect(`/admin/quotes/${req.params.id}`);
  } catch (e) { next(e); }
});

router.post('/admin/quotes/:id/delete', async (req, res, next) => {
  try { await db.query('DELETE FROM nl_quotes WHERE id=$1', [req.params.id]); res.redirect('/admin/quotes'); } catch (e) { next(e); }
});

// ═════════ Jobs ═════════
router.get('/admin/jobs', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT j.*, c.name AS client_name, (j.quoted_price - j.actual_cost) AS profit
      FROM nl_jobs j LEFT JOIN nl_clients c ON c.id=j.client_id
      ORDER BY (j.status IN ('completed','cancelled')), j.job_date NULLS LAST, j.id DESC`);
    res.render('admin/jobs', { title: 'Jobs', jobs: rows });
  } catch (e) { next(e); }
});

function blankJob(extra = {}) {
  return { status: 'scheduled', payment_status: 'unpaid', ...extra };
}

router.get('/admin/jobs/new', async (req, res, next) => {
  try {
    let job = blankJob({ client_id: num(req.query.client) });
    if (req.query.quote) {
      const q = (await db.query('SELECT * FROM nl_quotes WHERE id=$1', [req.query.quote])).rows[0];
      if (q) {
        const first = (q.items || [])[0];
        job = blankJob({ client_id: q.client_id, quote_id: q.id, quoted_price: q.total, package: first ? first.label : '', notes: q.title || '' });
      }
    }
    res.render('admin/job-form', { title: 'New job', job, photos: [], clients: await clientsList(), JOB_STATUSES, PAY_STATUSES, SERVICE_TYPES });
  } catch (e) { next(e); }
});

router.get('/admin/jobs/:id', async (req, res, next) => {
  try {
    const job = (await db.query('SELECT * FROM nl_jobs WHERE id=$1', [req.params.id])).rows[0];
    if (!job) return res.status(404).render('error', { message: 'Job not found.' });
    res.render('admin/job-form', { title: 'Job', job, photos: await listPhotos('job', job.id), clients: await clientsList(), JOB_STATUSES, PAY_STATUSES, SERVICE_TYPES });
  } catch (e) { next(e); }
});

const jobUpload = upload.fields([{ name: 'before', maxCount: 8 }, { name: 'after', maxCount: 8 }]);

function saveJob(id) {
  return (req, res, next) => jobUpload(req, res, async (err) => {
    if (err) return next(err);
    try {
      const b = req.body;
      const vals = [num(b.client_id), num(b.quote_id), b.service || null, (b.package || '').trim() || null, num(b.quoted_price),
        num(b.materials_cost), num(b.labor_hours), (b.employees || '').trim() || null, b.job_date || null,
        JOB_STATUSES.includes(b.status) ? b.status : 'scheduled', PAY_STATUSES.includes(b.payment_status) ? b.payment_status : 'unpaid',
        num(b.actual_cost), ((r) => (r >= 1 && r <= 5 ? Math.round(r) : null))(num(b.review_rating)), (b.customer_review || '').trim() || null, b.show_in_gallery === 'on', (b.notes || '').trim() || null];
      let jobId = id;
      if (id) {
        await db.query(`UPDATE nl_jobs SET client_id=$1, quote_id=$2, service=$3, package=$4, quoted_price=$5, materials_cost=$6, labor_hours=$7,
          employees=$8, job_date=$9, status=$10, payment_status=$11, actual_cost=$12, review_rating=$13, customer_review=$14,
          show_in_gallery=$15, notes=$16, updated_at=now() WHERE id=$17`, [...vals, id]);
      } else {
        const { rows } = await db.query(`INSERT INTO nl_jobs (client_id, quote_id, service, package, quoted_price, materials_cost, labor_hours,
          employees, job_date, status, payment_status, actual_cost, review_rating, customer_review, show_in_gallery, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`, vals);
        jobId = rows[0].id;
      }
      await savePhotos('job', jobId, (req.files && req.files.before) || [], 'before');
      await savePhotos('job', jobId, (req.files && req.files.after) || [], 'after');
      if (vals[0] && vals[8]) {
        // keep the client's status board in sync
        const clientStatus = { scheduled: 'scheduled', in_progress: 'in_progress', completed: 'completed' }[vals[9]];
        if (clientStatus) await db.query('UPDATE nl_clients SET status=$1, next_visit=$2, updated_at=now() WHERE id=$3', [clientStatus, vals[9] === 'completed' ? null : vals[8], vals[0]]);
      }
      res.redirect(`/admin/jobs/${jobId}`);
    } catch (e) { next(e); }
  });
}
router.post('/admin/jobs', saveJob());
router.post('/admin/jobs/:id', (req, res, next) => saveJob(req.params.id)(req, res, next));

router.post('/admin/jobs/:id/delete', async (req, res, next) => {
  try {
    await db.query(`DELETE FROM nl_photos WHERE owner_type='job' AND owner_id=$1`, [req.params.id]);
    await db.query('DELETE FROM nl_jobs WHERE id=$1', [req.params.id]);
    res.redirect('/admin/jobs');
  } catch (e) { next(e); }
});

router.post('/admin/photos/:id/delete', async (req, res, next) => {
  try {
    const p = (await db.query('DELETE FROM nl_photos WHERE id=$1 RETURNING owner_type, owner_id', [req.params.id])).rows[0];
    res.redirect(p ? `/admin/${p.owner_type === 'job' ? 'jobs' : 'requests'}/${p.owner_id}` : '/admin');
  } catch (e) { next(e); }
});

module.exports = router;
