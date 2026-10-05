// Fills the LOCAL TEST database with demo accounts and data. Refuses to run against anything else.
//   npm run seed:test
// Demo sign-ins (test database only — these accounts never exist on the live site):
const DEMO_USERS = [
  { email: 'owner@northline.test', password: 'owner-demo-2026', name: 'Olivia Owner', role: 'owner' },
  { email: 'admin@northline.test', password: 'admin-demo-2026', name: 'Adam Admin', role: 'admin' },
  { email: 'marcus@northline.test', password: 'crew-demo-2026', name: 'Marcus Reed', role: 'crew' },
  { email: 'dee@northline.test', password: 'crew-demo-2026', name: 'Dee Alvarez', role: 'crew' },
];

require('dotenv').config();
const url = process.env.DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost):5433\//.test(url)) {
  console.error('Refusing to seed: DATABASE_URL is not the local test database (port 5433).');
  process.exit(1);
}
const db = require('../db');
const { createAdmin } = require('../lib/auth');

// Dates in the business's own time zone, so "today" matches what the crew sees
const day = (n) => { const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  await db.migrate();
  const ids = {};
  for (const u of DEMO_USERS) {
    await createAdmin(u.email, u.password, u.name, u.role);
    const r = (await db.query('UPDATE nl_admins SET name=$1, role=$2, active=true WHERE email=$3 RETURNING id', [u.name, u.role, u.email])).rows[0];
    ids[u.email] = r.id;
  }
  if ((await db.query('SELECT count(*)::int AS n FROM nl_jobs')).rows[0].n === 0) {
    const client = async (name, address, phone) => (await db.query(
      `INSERT INTO nl_clients (name, email, phone, address, status) VALUES ($1,$2,$3,$4,'scheduled') RETURNING id`,
      [name, name.split(' ')[0].toLowerCase() + '@example.com', phone, address])).rows[0].id;
    const c1 = await client('Jordan Lee', '412 Forest Hills Dr, Durham, NC', '919-555-0141');
    const c2 = await client('Priya Shah', '88 Maynard Rd, Cary, NC', '919-555-0172');
    const c3 = await client('Tom Becker', '19 Weaver St, Chapel Hill, NC', '919-555-0193');
    const job = async (clientId, service, pkg, date, time, price, crew, notes) => {
      const id = (await db.query(`INSERT INTO nl_jobs (client_id, service, package, job_date, start_time, quoted_price, notes, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING id`, [clientId, service, pkg, date, time, price, notes])).rows[0].id;
      for (const e of crew) await db.query('INSERT INTO nl_job_crew (job_id, user_id) VALUES ($1,$2)', [id, ids[e]]);
      await db.query('UPDATE nl_jobs SET employees=$1 WHERE id=$2', [crew.map((e) => DEMO_USERS.find((u) => u.email === e).name.split(' ')[0]).join(', '), id]);
    };
    await job(c1, 'Lawn Care', 'Full Refresh — medium lawn', day(0), '08:00', 269, ['marcus@northline.test', 'dee@northline.test'], 'Gate code 4412. Dog is friendly.');
    await job(c2, 'Pressure Washing', 'Driveway + front walkway', day(1), '10:30', 125, ['dee@northline.test'], null);
    await job(c3, 'Painting', 'Room Refresh — living room', day(3), '09:00', 650, ['marcus@northline.test'], 'Customer is supplying paint (SW Agreeable Gray).');
    await job(c1, 'Lawn Care', 'Basic Lawn Care', null, null, 59, [], null);
    await db.query(`INSERT INTO nl_requests (name, phone, email, address, service, description) VALUES
      ('Casey Morgan','919-555-0110','casey@example.com','5 Elm St, Raleigh, NC','Pressure Washing','Driveway and back patio, pretty grimy.')`);
    await db.query(`INSERT INTO nl_requests (kind, company, property_type, frequency, name, phone, email, address, service, description) VALUES
      ('commercial','Brightside Dental','Office','Every other week','Renee Park','919-555-0120','renee@example.com','200 Main St, Durham, NC','Commercial: Grounds Maintenance, Pressure Washing','Small lot, front beds and sidewalk.')`);
    await db.query(`INSERT INTO nl_applications (name, email, phone, city, position, availability, has_license, has_transport, experience) VALUES
      ('Luis Ortega','luis@example.com','919-555-0130','Durham','Lawn Care Crew Member','Weekdays',true,true,'Two summers mowing commercial lots.')`);
  }
  console.log('Test database seeded. Demo sign-ins are listed at the top of scripts/seed-test.js.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
