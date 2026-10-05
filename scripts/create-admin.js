// Usage: npm run admin:create -- you@example.com "your password"
require('dotenv').config();
const db = require('../db');
const { createAdmin } = require('../lib/auth');
const [email, password] = process.argv.slice(2);
if (!email || !password) { console.log('Usage: npm run admin:create -- email "password"'); process.exit(1); }
db.migrate().then(() => createAdmin(email, password))
  .then((a) => { console.log(`Admin ready: ${a.email}`); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); });
