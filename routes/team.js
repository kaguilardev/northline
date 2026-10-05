// Owner only: team accounts, roles and sign-in links.
const express = require('express');
const db = require('../db');
const { ROLES, requireOwner, issueInvite } = require('../lib/auth');
const { sendMessage, enabled: emailEnabled } = require('../lib/email');
const { baseUrl } = require('./public');

const router = express.Router();
router.use('/admin/team', requireOwner);
const ROLE_KEYS = ROLES.map((r) => r.key);
const clean = (v, n = 200) => String(v || '').trim().slice(0, n);

async function activeOwners(exceptId) {
  return (await db.query(`SELECT count(*)::int AS n FROM nl_admins WHERE role='owner' AND active AND id <> $1`, [exceptId || 0])).rows[0].n;
}

// Shows a freshly made sign-in link once, then forgets it.
function takeLink(req) { const l = req.session.newLink || null; delete req.session.newLink; return l; }

async function listUsers() {
  return (await db.query(`SELECT id, name, email, phone, role, active, last_login_at, password_hash IS NOT NULL AS has_password,
      invite_expires > now() AS invite_open,
      (SELECT count(*)::int FROM nl_job_crew jc JOIN nl_jobs j ON j.id=jc.job_id WHERE jc.user_id=a.id AND j.status IN ('scheduled','in_progress')) AS open_jobs
      FROM nl_admins a ORDER BY active DESC, array_position(ARRAY['owner','admin','crew'], role), name NULLS LAST`)).rows;
}

router.get('/admin/team', async (req, res, next) => {
  try {
    res.render('admin/team', { title: 'Team', users: await listUsers(), roles: ROLES, error: null, form: {} });
  } catch (e) { next(e); }
});

router.post('/admin/team', async (req, res, next) => {
  try {
    const form = { name: clean(req.body.name), email: clean(req.body.email).toLowerCase(), phone: clean(req.body.phone, 40), role: req.body.role };
    const fail = async (error) => res.status(400).render('admin/team', { title: 'Team', users: await listUsers(), roles: ROLES, error, form });
    if (!form.name || !form.email || !ROLE_KEYS.includes(form.role)) return fail('Add a name, email and role.');
    if ((await db.query('SELECT 1 FROM nl_admins WHERE lower(email)=$1', [form.email])).rows[0]) return fail('Someone on the team already uses that email.');
    const { rows } = await db.query(`INSERT INTO nl_admins (name, email, phone, role, password_hash) VALUES ($1,$2,$3,$4,NULL) RETURNING id`,
      [form.name, form.email, form.phone || null, form.role]);
    req.session.newLink = { id: rows[0].id, url: `${baseUrl(req)}/invite/${await issueInvite(rows[0].id)}`, fresh: true };
    res.redirect(`/admin/team/${rows[0].id}`);
  } catch (e) { next(e); }
});

router.get('/admin/team/:id', async (req, res, next) => {
  try {
    const u = (await db.query(`SELECT id, name, email, phone, role, active, last_login_at, password_hash IS NOT NULL AS has_password,
      invite_expires, invite_expires > now() AS invite_open FROM nl_admins WHERE id=$1`, [req.params.id])).rows[0];
    if (!u) return res.status(404).render('error', { message: 'Team member not found.' });
    const link = takeLink(req);
    res.render('admin/team-member', { title: u.name || u.email, u, roles: ROLES, link: link && String(link.id) === String(u.id) ? link : null,
      isSelf: u.id === req.session.user.id, emailEnabled: emailEnabled(), flash: req.query.flash || null, error: null });
  } catch (e) { next(e); }
});

router.post('/admin/team/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const isSelf = id === req.session.user.id;
    const role = ROLE_KEYS.includes(req.body.role) ? req.body.role : null;
    const active = req.body.active === 'on';
    const current = (await db.query('SELECT role, active FROM nl_admins WHERE id=$1', [id])).rows[0];
    if (!current) return res.redirect('/admin/team');
    // Never lock the business out: you can't demote or switch off yourself, and there must always be an active owner
    const newRole = isSelf ? current.role : (role || current.role);
    const newActive = isSelf ? true : active;
    if (current.role === 'owner' && (newRole !== 'owner' || !newActive) && !(await activeOwners(id))) {
      return res.redirect(`/admin/team/${id}?flash=${encodeURIComponent('There has to be at least one active owner.')}`);
    }
    await db.query('UPDATE nl_admins SET name=$1, phone=$2, role=$3, active=$4 WHERE id=$5',
      [clean(req.body.name) || null, clean(req.body.phone, 40) || null, newRole, newActive, id]);
    res.redirect(`/admin/team/${id}?flash=${encodeURIComponent('Saved.')}`);
  } catch (e) { next(e); }
});

// New sign-in link: for someone who hasn't set up yet, or who forgot their password.
router.post('/admin/team/:id/link', async (req, res, next) => {
  try {
    const u = (await db.query('SELECT id, name, email, active FROM nl_admins WHERE id=$1', [req.params.id])).rows[0];
    if (!u || !u.active) return res.redirect('/admin/team');
    const url = `${baseUrl(req)}/invite/${await issueInvite(u.id)}`;
    let flash = null;
    if (req.body.via === 'email') {
      try {
        const r = await sendMessage({ to: u.email, name: u.name, subject: 'Your Northline sign-in link', baseUrl: baseUrl(req),
          body: `Use this link to set your password and sign in to the Northline team app:\n\n${url}\n\nThe link works once and expires in 7 days. After that, sign in at ${baseUrl(req)}/login\n\nTip: on your phone, open the link in Safari or Chrome, then use "Add to Home Screen" to keep Northline like an app.` });
        flash = r.preview ? 'Email sending is off, so copy the link below and text it instead.' : `Sign-in link emailed to ${u.email}.`;
      } catch (e) { flash = `Email failed: ${e.message}. Copy the link below instead.`; }
    }
    req.session.newLink = { id: u.id, url };
    res.redirect(`/admin/team/${u.id}${flash ? '?flash=' + encodeURIComponent(flash) : ''}`);
  } catch (e) { next(e); }
});

module.exports = router;
