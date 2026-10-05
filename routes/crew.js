// Crew screens: each person's own jobs and schedule. Logistics only — no prices, costs or quotes ever leave this file.
const express = require('express');
const db = require('../db');
const { requireUser, STAFF } = require('../lib/auth');
const { upload, savePhotos, listPhotos } = require('../lib/photos');
const { syncClientFromJob } = require('../lib/pipeline');

const router = express.Router();
router.use('/crew', requireUser);

// The only job columns crew can see
const JOB_FIELDS = `j.id, j.job_date, j.start_time, j.service, j.package, j.status, j.notes, j.client_id,
  c.name AS client_name, c.address, c.phone,
  (SELECT string_agg(COALESCE(a.name, a.email), ', ' ORDER BY a.name) FROM nl_job_crew x JOIN nl_admins a ON a.id=x.user_id WHERE x.job_id=j.id) AS crew`;

async function myJob(req, id) {
  const u = req.session.user;
  const { rows } = await db.query(`SELECT ${JOB_FIELDS},
      EXISTS (SELECT 1 FROM nl_job_crew x WHERE x.job_id=j.id AND x.user_id=$2) AS mine
    FROM nl_jobs j LEFT JOIN nl_clients c ON c.id=j.client_id WHERE j.id=$1`, [id, u.id]);
  const job = rows[0];
  if (!job || !(job.mine || STAFF.includes(u.role))) return null;
  return job;
}

router.get('/crew', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT ${JOB_FIELDS} FROM nl_jobs j
      JOIN nl_job_crew me ON me.job_id=j.id AND me.user_id=$1
      LEFT JOIN nl_clients c ON c.id=j.client_id
      WHERE j.status IN ('scheduled','in_progress') OR (j.status='completed' AND j.job_date >= current_date - 7)
      ORDER BY j.job_date NULLS LAST, j.start_time NULLS LAST, j.id`, [req.session.user.id]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD, local business day
    const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
    const groups = { today: [], upcoming: [], unscheduled: [], done: [] };
    rows.forEach((j) => {
      if (j.status === 'completed') groups.done.push(j);
      else if (!j.job_date) groups.unscheduled.push(j);
      else if (day(j.job_date) <= today) groups.today.push(j); // today, plus anything overdue that isn't finished
      else groups.upcoming.push(j);
    });
    res.render('crew/schedule', { title: 'My schedule', groups, today });
  } catch (e) { next(e); }
});

router.get('/crew/jobs/:id', async (req, res, next) => {
  try {
    const job = await myJob(req, req.params.id);
    if (!job) return res.status(404).render('error', { message: 'That job isn’t on your schedule.' });
    res.render('crew/job', { title: job.client_name || 'Job', job, photos: await listPhotos('job', job.id), flash: req.query.flash || null });
  } catch (e) { next(e); }
});

// Crew can move a job forward: scheduled → in progress → completed
router.post('/crew/jobs/:id/status', async (req, res, next) => {
  try {
    const job = await myJob(req, req.params.id);
    if (!job) return res.redirect('/crew');
    const next_ = { scheduled: 'in_progress', in_progress: 'completed' }[job.status];
    if (next_ && req.body.status === next_) {
      await db.query('UPDATE nl_jobs SET status=$1, updated_at=now() WHERE id=$2', [next_, job.id]);
      await syncClientFromJob(job.client_id, next_, job.job_date);
    }
    res.redirect(`/crew/jobs/${job.id}?flash=${encodeURIComponent(next_ === 'completed' ? 'Marked complete — nice work!' : 'Job started.')}`);
  } catch (e) { next(e); }
});

router.post('/crew/jobs/:id/photos', (req, res, next) => {
  upload.array('photos', 8)(req, res, async (err) => {
    try {
      const job = await myJob(req, req.params.id);
      if (!job) return res.redirect('/crew');
      if (err) return res.redirect(`/crew/jobs/${job.id}?flash=${encodeURIComponent('Those photos couldn’t be uploaded. Try up to 8 at a time.')}`);
      const kind = req.body.kind === 'before' ? 'before' : 'after';
      await savePhotos('job', job.id, req.files || [], kind);
      const n = (req.files || []).length;
      res.redirect(`/crew/jobs/${job.id}?flash=${encodeURIComponent(n ? `${n} ${kind} photo${n > 1 ? 's' : ''} added.` : 'No photos were chosen.')}`);
    } catch (e) { next(e); }
  });
});

module.exports = router;
