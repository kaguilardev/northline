require('dotenv').config();
const db = require('../db');
db.migrate().then(() => { console.log('Database tables are ready.'); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); });
