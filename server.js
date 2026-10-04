require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const db = require('./db');
const { bootstrapAdmin } = require('./lib/auth');

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
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 12 },
}));

app.use((req, res, next) => {
  res.locals.admin = req.session.admin || null;
  res.locals.path = req.path;
  res.locals.business = process.env.BUSINESS_NAME || 'Northline Landscaping';
  next();
});

app.get('/', (req, res) => res.render('home'));
app.get('/healthz', (req, res) => res.send('ok'));
app.use(require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { message: 'Page not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: isProd ? 'Something went wrong.' : err.message });
});

(async () => {
  try {
    await db.migrate();
    await bootstrapAdmin();
  } catch (e) {
    console.error('\n  Could not connect to the database:', e.message, '\n');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`\n  Northline running at http://localhost:${PORT}\n`));
})();
