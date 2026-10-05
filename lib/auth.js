const bcrypt = require('bcryptjs');
const db = require('../db');

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

async function verifyLogin(email, password) {
  const { rows } = await db.query('SELECT * FROM nl_admins WHERE lower(email) = lower($1)', [email]);
  const admin = rows[0];
  if (!admin) return null;
  const ok = await bcrypt.compare(password, admin.password_hash);
  return ok ? { id: admin.id, email: admin.email, name: admin.name } : null;
}

async function createAdmin(email, password, name) {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO nl_admins (email, password_hash, name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, email`,
    [email, hash, name || null]
  );
  return rows[0];
}

// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if none exist yet.
async function bootstrapAdmin() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM nl_admins');
  if (rows[0].n > 0) return;
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('No admin account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, or run: npm run admin:create');
    return;
  }
  await createAdmin(ADMIN_EMAIL, ADMIN_PASSWORD, 'Owner');
  console.log(`Created first admin: ${ADMIN_EMAIL}`);
}

module.exports = { requireAdmin, verifyLogin, createAdmin, bootstrapAdmin };
