const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

// owner: everything · admin: day-to-day office work · crew: their own schedule only
const ROLES = [
  { key: 'owner', label: 'Owner', hint: 'Everything, including prices, settings, security and team accounts' },
  { key: 'admin', label: 'Admin', hint: 'Requests, quotes, jobs, clients and emails — no prices, settings or team accounts' },
  { key: 'crew',  label: 'Crew',  hint: 'Their own jobs and schedule only — no prices or customer pipeline' },
];
const STAFF = ['owner', 'admin'];

const userOf = (req) => (req.session && req.session.user) || null;

function toLogin(req, res) {
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

// Owner + admin screens (/admin). Crew are sent to their schedule instead.
function requireAdmin(req, res, next) {
  const u = userOf(req);
  if (!u) return toLogin(req, res);
  if (STAFF.includes(u.role)) return next();
  return res.redirect('/crew');
}

function requireOwner(req, res, next) {
  const u = userOf(req);
  if (!u) return toLogin(req, res);
  if (u.role === 'owner') return next();
  return res.status(403).render('error', { message: 'Only the owner account can open this page.' });
}

// Anyone signed in (crew screens).
function requireUser(req, res, next) {
  return userOf(req) ? next() : toLogin(req, res);
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

async function verifyLogin(email, password) {
  const { rows } = await db.query('SELECT * FROM nl_admins WHERE lower(email) = lower($1)', [email]);
  const u = rows[0];
  if (!u || !u.active || !u.password_hash) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  await db.query('UPDATE nl_admins SET last_login_at=now() WHERE id=$1', [u.id]);
  return publicUser(u);
}

// Re-reads the signed-in user on each request so role changes and deactivation take effect immediately.
async function refreshUser(req, res, next) {
  const u = userOf(req);
  if (!u) return next();
  try {
    const { rows } = await db.query('SELECT id, email, name, role, active FROM nl_admins WHERE id=$1', [u.id]);
    if (!rows[0] || !rows[0].active) { req.session.user = null; return next(); }
    req.session.user = publicUser(rows[0]);
  } catch { /* keep the session user if the database blips */ }
  next();
}

async function createAdmin(email, password, name, role = 'owner') {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO nl_admins (email, password_hash, name, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, email`,
    [email, hash, name || null, role]
  );
  return rows[0];
}

// A one-time link a new team member (or someone who forgot their password) uses to set a password.
// Only a hash is stored, so the link can be shown once and can't be read back out of the database.
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// hours: 7 days for a new teammate's setup link, 1 hour for a self-service password reset
async function issueInvite(userId, hours = 24 * 7) {
  const token = crypto.randomBytes(24).toString('base64url');
  await db.query(`UPDATE nl_admins SET invite_token=$1, invite_expires=now() + make_interval(hours => $3) WHERE id=$2`, [hashToken(token), userId, hours]);
  return token;
}

async function findInvite(token) {
  if (!token) return null;
  const { rows } = await db.query(`SELECT id, email, name, role, password_hash IS NOT NULL AS has_password FROM nl_admins WHERE invite_token=$1 AND invite_expires > now() AND active`, [hashToken(token)]);
  return rows[0] || null;
}

async function acceptInvite(token, password) {
  const u = await findInvite(token);
  if (!u) return null;
  const hash = await bcrypt.hash(password, 12);
  await db.query(`UPDATE nl_admins SET password_hash=$1, invite_token=NULL, invite_expires=NULL, last_login_at=now() WHERE id=$2`, [hash, u.id]);
  return publicUser(u);
}

// Creates the first owner from ADMIN_EMAIL / ADMIN_PASSWORD if no accounts exist yet.
async function bootstrapAdmin() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM nl_admins');
  if (rows[0].n > 0) return;
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('No accounts yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, or run: npm run admin:create');
    return;
  }
  await createAdmin(ADMIN_EMAIL, ADMIN_PASSWORD, 'Owner', 'owner');
  console.log(`Created owner account: ${ADMIN_EMAIL}`);
}

module.exports = { ROLES, STAFF, requireAdmin, requireOwner, requireUser, refreshUser, verifyLogin, createAdmin,
  issueInvite, findInvite, acceptInvite, bootstrapAdmin };
