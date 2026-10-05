// `npm run dev`: if .env points at the local test database, start it first, then run the app with auto-restart.
import 'dotenv/config';
import { spawn } from 'child_process';
import { startTestDb, TEST_DB } from './test-db.mjs';

let pg = null;
if ((process.env.DATABASE_URL || '').includes(`:${TEST_DB.port}/`)) {
  pg = await startTestDb();
  console.log('  Using the local TEST database (.testdb/) — live data is untouched.');
}
const app = spawn('npx', ['nodemon', '--watch', '.', '--ignore', '.testdb', '--ext', 'js,ejs,css,sql', 'server.js'], { stdio: 'inherit' });
const stop = async () => { app.kill('SIGINT'); if (pg) await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
app.on('exit', async (code) => { if (pg) await pg.stop(); process.exit(code || 0); });
