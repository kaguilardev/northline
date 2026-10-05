// Local test database (PostgreSQL bundled via the embedded-postgres dev package).
// Data lives in .testdb/ in this folder and never touches the live database.
//   node scripts/test-db.mjs          start it and keep it running (Ctrl+C to stop)
//   import { startTestDb } from ...   start it from another script
import fs from 'fs';
import path from 'path';
import EmbeddedPostgres from 'embedded-postgres';

export const TEST_DB = { host: '127.0.0.1', port: 5433, user: 'northline', password: 'northline-local', database: 'northline_test' };
export const TEST_DB_URL = `postgres://${TEST_DB.user}:${TEST_DB.password}@${TEST_DB.host}:${TEST_DB.port}/${TEST_DB.database}`;

export async function startTestDb() {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.testdb');
  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: TEST_DB.user, password: TEST_DB.password, port: TEST_DB.port, persistent: true, onLog: () => {} });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(TEST_DB.database);
  return pg;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pg = await startTestDb();
  console.log(`Test database running at ${TEST_DB_URL}  (Ctrl+C to stop)`);
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
