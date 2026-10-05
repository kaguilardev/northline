// Office view of every job for a week, with who's on it.
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();
router.use('/admin/schedule', requireAdmin);

const iso = (d) => d.toISOString().slice(0, 10);
function mondayOf(str) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(str || '') ? new Date(str + 'T00:00:00Z')
    : new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

router.get('/admin/schedule', async (req, res, next) => {
  try {
    const start = mondayOf(req.query.week);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    const person = Number(req.query.person) || null;
    const jobFields = `j.id, j.job_date, j.start_time, j.service, j.package, j.status, c.name AS client_name, c.address,
      (SELECT string_agg(COALESCE(a.name, a.email), ', ' ORDER BY a.name) FROM nl_job_crew x JOIN nl_admins a ON a.id=x.user_id WHERE x.job_id=j.id) AS crew,
      NOT EXISTS (SELECT 1 FROM nl_job_crew x WHERE x.job_id=j.id) AS no_crew`;
    const who = person ? 'AND EXISTS (SELECT 1 FROM nl_job_crew x WHERE x.job_id=j.id AND x.user_id=$3)' : '';
    const params = [iso(start), iso(end)].concat(person ? [person] : []);
    const { rows } = await db.query(`SELECT ${jobFields} FROM nl_jobs j LEFT JOIN nl_clients c ON c.id=j.client_id
      WHERE j.job_date BETWEEN $1 AND $2 AND j.status <> 'cancelled' ${who} ORDER BY j.job_date, j.start_time NULLS LAST, j.id`, params);
    const unscheduled = (await db.query(`SELECT ${jobFields} FROM nl_jobs j LEFT JOIN nl_clients c ON c.id=j.client_id
      WHERE j.job_date IS NULL AND j.status IN ('scheduled','in_progress') ORDER BY j.id DESC`)).rows;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
      return { date: iso(d), jobs: rows.filter((j) => iso(new Date(j.job_date)) === iso(d)) };
    });
    const step = (n) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    const team = (await db.query(`SELECT id, name, email FROM nl_admins WHERE active ORDER BY role='crew' DESC, name`)).rows;
    res.render('admin/schedule', { title: 'Schedule', days, unscheduled, team, person, week: iso(start), prev: step(-7), next: step(7),
      today: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) });
  } catch (e) { next(e); }
});

module.exports = router;
