require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const db = require('./db');
const { bootstrapAdmin, refreshUser, STAFF } = require('./lib/auth');
const pricing = require('./lib/pricing');
const icon = require('./lib/icons');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  console.error('\n  DATABASE_URL is not set. Copy .env.example to .env and add your PostgreSQL connection string.\n');
  process.exit(1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // Render sits behind a proxy

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new PgSession({ pool: db.pool, tableName: 'nl_session' }),
  secret: process.env.SESSION_SECRET || 'dev-only-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 12 }, // 12h; "Remember me" extends to 30 days
}));

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');

// Values every page can use
app.locals.icon = icon;
app.locals.money = pricing.money;
app.locals.range = pricing.range;
app.locals.fmtDate = fmtDate;
app.locals.services = pricing.SERVICES;
app.locals.areas = pricing.SERVICE_AREAS;
app.locals.policy = pricing.POLICY;
app.locals.lawnSizes = pricing.LAWN_SIZES;
app.locals.lawnPackages = pricing.LAWN_PACKAGES;
app.locals.outdoorAddons = pricing.OUTDOOR_ADDONS;
app.locals.lawnAdjustments = pricing.LAWN_ADJUSTMENTS;
app.locals.paintPackages = pricing.PAINT_PACKAGES;
app.locals.paintAddons = pricing.PAINT_ADDONS;
app.locals.pressureSurfaces = pricing.PRESSURE_SURFACES;
app.locals.contact = { phone: process.env.BUSINESS_PHONE || '', email: process.env.BUSINESS_EMAIL || '' };

app.use(refreshUser);
app.use((req, res, next) => {
  const user = req.session.user || null;
  res.locals.user = user;
  res.locals.admin = user && STAFF.includes(user.role) ? user : null; // office screens
  res.locals.isOwner = !!(user && user.role === 'owner');
  // A real first name for greetings — never a placeholder like "Owner" or "Admin"
  const first = user && user.name ? user.name.trim().split(/\s+/)[0] : '';
  res.locals.firstName = first && !['owner', 'admin', 'crew'].includes(first.toLowerCase()) ? first : '';
  res.locals.path = req.path;
  res.locals.business = process.env.BUSINESS_NAME || 'Northline Home & Outdoor';
  next();
});

// Badge in the admin menu: estimate requests nobody has opened yet
app.use('/admin', async (req, res, next) => {
  if (!res.locals.admin) return next();
  try {
    const { rows } = await db.query(`SELECT (SELECT count(*)::int FROM nl_requests WHERE viewed_at IS NULL) AS r,
      (SELECT count(*)::int FROM nl_applications WHERE viewed_at IS NULL) AS a`);
    res.locals.newRequests = rows[0].r; res.locals.newApplicants = rows[0].a;
  } catch { /* ignore */ }
  next();
});

app.use(require('./lib/translate').middleware);
app.get('/healthz', (req, res) => res.send('ok'));
app.use(require('./routes/public'));
app.use(require('./routes/admin'));
app.use(require('./routes/ops'));
app.use(require('./routes/applicants'));
app.use(require('./routes/team'));
app.use(require('./routes/schedule'));
app.use(require('./routes/crew'));

app.use((req, res) => res.status(404).render('error', { message: 'Page not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: isProd ? 'Something went wrong.' : err.message });
});

(async () => {
  try {
    await db.migrate();
    await bootstrapAdmin();
    await require('./lib/pipeline').backfillAcceptedJobs();
  } catch (e) {
    console.error('\n  Could not connect to the database:', e.message, '\n');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`\n  Northline running at http://localhost:${PORT}\n`));
})();
