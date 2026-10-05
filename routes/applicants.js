// Admin: job applications from the careers page.
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../lib/auth');
const { APPLICANT_STATUSES } = require('../lib/business');

const router = express.Router();
router.use('/admin/applicants', requireAdmin);
const KEYS = APPLICANT_STATUSES.map((s) => s.key);
const OPEN = ['new', 'reviewing', 'interview'];

router.get('/admin/applicants', async (req, res, next) => {
  try {
    const tab = KEYS.includes(req.query.status) || req.query.status === 'closed' ? req.query.status : 'open';
    const show = tab === 'open' ? OPEN : tab === 'closed' ? ['hired', 'declined'] : [tab];
    const { rows } = await db.query(`SELECT id, name, phone, email, city, position, status, has_license, has_transport, viewed_at, created_at,
      resume_name IS NOT NULL AS has_resume FROM nl_applications WHERE status = ANY($1) ORDER BY created_at DESC`, [show]);
    const counts = Object.fromEntries((await db.query('SELECT status, count(*)::int AS n FROM nl_applications GROUP BY status')).rows.map((r) => [r.status, r.n]));
    const sum = (keys) => keys.reduce((t, k) => t + (counts[k] || 0), 0);
    const tabs = [{ key: 'open', label: 'All open', n: sum(OPEN) },
      ...APPLICANT_STATUSES.filter((s) => OPEN.includes(s.key)).map((s) => ({ key: s.key, label: s.label, n: counts[s.key] || 0 })),
      { key: 'closed', label: 'Hired / not a fit', n: sum(['hired', 'declined']) }];
    res.render('admin/applicants', { title: 'Applicants', apps: rows, tab, tabs, statuses: APPLICANT_STATUSES, back: req.originalUrl });
  } catch (e) { next(e); }
});

router.get('/admin/applicants/:id', async (req, res, next) => {
  try {
    const a = (await db.query(`SELECT id, name, email, phone, city, position, start_date, availability, has_license, has_transport, experience,
      resume_name, resume_mime, status, notes, viewed_at, created_at FROM nl_applications WHERE id=$1`, [req.params.id])).rows[0];
    if (!a) return res.status(404).render('error', { message: 'Application not found.' });
    if (!a.viewed_at) {
      await db.query('UPDATE nl_applications SET viewed_at=now() WHERE id=$1', [a.id]);
      if (res.locals.newApplicants) res.locals.newApplicants--;
    }
    res.render('admin/applicant', { title: a.name, a, statuses: APPLICANT_STATUSES });
  } catch (e) { next(e); }
});

router.get('/admin/applicants/:id/resume', async (req, res, next) => {
  try {
    const a = (await db.query('SELECT resume_name, resume_mime, resume_data FROM nl_applications WHERE id=$1', [req.params.id])).rows[0];
    if (!a || !a.resume_data) return res.status(404).render('error', { message: 'No résumé attached.' });
    res.set('Content-Type', a.resume_mime);
    res.set('Content-Disposition', `attachment; filename="${(a.resume_name || 'resume').replace(/[^\w.\- ]/g, '_')}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(a.resume_data);
  } catch (e) { next(e); }
});

router.post('/admin/applicants/:id', async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    if (KEYS.includes(status)) await db.query('UPDATE nl_applications SET status=$1 WHERE id=$2', [status, req.params.id]);
    if (typeof notes === 'string') await db.query('UPDATE nl_applications SET notes=$1 WHERE id=$2', [notes.trim() || null, req.params.id]);
    const back = String(req.body.back || '');
    res.redirect(back.startsWith('/admin/applicants') ? back : `/admin/applicants/${req.params.id}`);
  } catch (e) { next(e); }
});

router.post('/admin/applicants/:id/delete', async (req, res, next) => {
  try { await db.query('DELETE FROM nl_applications WHERE id=$1', [req.params.id]); res.redirect('/admin/applicants'); } catch (e) { next(e); }
});

module.exports = router;
