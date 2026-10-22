const express = require('express');
const db = require('../db');
const pricing = require('../lib/pricing');
const { upload, savePhotos } = require('../lib/photos');
const multer = require('multer');
const { notifyNewRequest, notifyNewApplication } = require('../lib/email');
const biz = require('../lib/business');
const security = require('../lib/security');
const { markQuoteAccepted } = require('../lib/pipeline');

const router = express.Router();

// Project types on the estimate form: the four concrete services, plus "not sure"
const SERVICE_OPTIONS = pricing.SERVICES.map((s) => s.request).concat('Not sure yet');
const SERVICE_PREFILL = Object.fromEntries(pricing.SERVICES.map((s) => [s.key, s.request]));
const pick = (list, v) => (list.includes(v) ? v : null);

// Retired pages (and old names) send visitors and search engines to the closest current page
const REDIRECTS = {
  '/services': '/concrete-services', '/gallery': '/our-work', '/lawn-care': '/concrete-services',
  '/painting': '/concrete-services', '/pressure-washing': '/concrete-services', '/commercial': '/concrete-services',
};
for (const [from, to] of Object.entries(REDIRECTS)) router.get(from, (req, res) => res.redirect(301, to));

// Real Northline jobs marked "show in gallery", with a before, preparation and after photo when there is one
async function galleryProjects(limit = null) {
  const { rows } = await db.query(`
    SELECT j.id, j.service, j.package, j.customer_review,
      (SELECT id FROM nl_photos WHERE owner_type='job' AND owner_id=j.id AND kind='before' ORDER BY id LIMIT 1) AS before,
      (SELECT id FROM nl_photos WHERE owner_type='job' AND owner_id=j.id AND kind='prep'   ORDER BY id LIMIT 1) AS prep,
      (SELECT id FROM nl_photos WHERE owner_type='job' AND owner_id=j.id AND kind='after'  ORDER BY id LIMIT 1) AS after
    FROM nl_jobs j WHERE j.show_in_gallery ORDER BY j.job_date DESC NULLS LAST, j.id DESC`);
  const projects = rows.filter((r) => r.before || r.prep || r.after);
  return limit ? projects.slice(0, limit) : projects;
}

router.get('/', async (req, res, next) => {
  try { res.render('site/home', { projects: await galleryProjects(3) }); } catch (e) { next(e); }
});
router.get('/concrete-services', (req, res) => res.render('site/services'));
router.get('/about', (req, res) => res.render('site/about'));
router.get('/service-area', (req, res) => res.render('site/service-area'));

router.get('/our-work', async (req, res, next) => {
  try { res.render('site/gallery', { projects: await galleryProjects() }); } catch (e) { next(e); }
});

// ---------- Estimate request form ----------
const estimatePage = (res, form, error, status = 200) => res.status(status).render('site/estimate', {
  error, form, serviceOptions: SERVICE_OPTIONS, surfaces: biz.CURRENT_SURFACES, finishes: biz.FINISHES });

router.get('/estimate', (req, res) => estimatePage(res, { service: SERVICE_PREFILL[req.query.service] || '' }, null));

router.post('/estimate', (req, res, next) => {
  upload.array('photos', 8)(req, res, async (err) => {
    const form = req.body || {};
    const fail = (msg) => estimatePage(res, form, msg, 400);
    if (err) return fail(err.code === 'LIMIT_FILE_SIZE' ? 'One of the photos is too large (10 MB max each).' : 'We couldn’t upload those photos. Please try again with up to 8 images.');
    if (form.website) { security.logSpam(req, 'estimate', 'honeypot', form); return res.redirect('/estimate/thanks'); } // a bot filled the hidden field
    if (security.tooMany(req)) { security.logSpam(req, 'estimate', 'too_many', form); return fail('We’ve received several requests from you in a short time. Please wait a few minutes, or give us a call.'); }
    const name = (form.name || '').trim();
    const service = pick(SERVICE_OPTIONS, form.service);
    if (!name || !form.phone || !form.email || !form.address || !service) return fail('Please fill in all the required fields.');
    const measurements = (form.measurements || '').trim().slice(0, 200) || null;
    const surface = pick(biz.CURRENT_SURFACES, form.current_surface), finish = pick(biz.FINISHES, form.finish);
    try {
      const { rows } = await db.query(
        `INSERT INTO nl_requests (name, phone, email, address, service, preferred_date, description, measurements, current_surface, finish)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [name, form.phone.trim(), form.email.trim(), form.address.trim(), service, form.preferred_date || null, (form.description || '').trim() || null,
          measurements, surface, finish]);
      const id = rows[0].id;
      await savePhotos('request', id, req.files || []);
      notifyNewRequest({ id, name, service, phone: form.phone, email: form.email, address: form.address, measurements, surface, finish,
        description: form.description, photos: (req.files || []).length, baseUrl: baseUrl(req) }).catch((e) => console.error('notify failed:', e.message));
      req.session.lastRequestName = name;
      res.redirect('/estimate/thanks');
    } catch (e) { next(e); }
  });
});

router.get('/estimate/thanks', (req, res) => res.render('site/thanks', { name: req.session.lastRequestName || '' }));

// ---------- Careers ----------
const RESUME_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const resumeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, RESUME_TYPES.includes(file.mimetype)) }).single('resume');
const careersPage = (res, form, error, status = 200) => res.status(status).render('site/careers', { form, error, openings: biz.OPENINGS });

router.get('/careers', (req, res) => careersPage(res, {}, null));

router.post('/careers', (req, res, next) => {
  resumeUpload(req, res, async (err) => {
    const form = req.body || {};
    const fail = (msg) => careersPage(res, form, msg, 400);
    if (err) return fail(err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (10 MB max).' : 'We couldn’t attach that file. Try a PDF, Word document or photo.');
    if (form.website) { security.logSpam(req, 'careers', 'honeypot', form); return res.redirect('/careers/thanks'); } // a bot filled the hidden field
    if (security.tooMany(req)) { security.logSpam(req, 'careers', 'too_many', form); return fail('We’ve received several requests from you in a short time. Please wait a few minutes, or give us a call.'); }
    const name = (form.name || '').trim();
    if (!name || !form.phone || !form.email || !form.position) return fail('Please fill in all the required fields.');
    try {
      const f = req.file;
      const { rows } = await db.query(
        `INSERT INTO nl_applications (name, email, phone, city, position, start_date, availability, has_license, has_transport, experience, resume_name, resume_mime, resume_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [name.slice(0, 200), form.email.trim(), form.phone.trim(), (form.city || '').trim() || null, String(form.position).slice(0, 100),
          form.start_date || null, (form.availability || '').trim() || null, form.has_license === 'on', form.has_transport === 'on',
          (form.experience || '').trim() || null, f ? f.originalname : null, f ? f.mimetype : null, f ? f.buffer : null]);
      notifyNewApplication({ id: rows[0].id, name, position: form.position, phone: form.phone, email: form.email, baseUrl: baseUrl(req) })
        .catch((e) => console.error('notify failed:', e.message));
      req.session.lastRequestName = name;
      res.redirect('/careers/thanks');
    } catch (e) { next(e); }
  });
});

router.get('/careers/thanks', (req, res) => res.render('site/thanks', { name: req.session.lastRequestName || '', kind: 'application' }));

// ---------- Photos ----------
router.get('/photo/:id', async (req, res, next) => {
  try {
    const user = (req.session && req.session.user) || null;
    const { rows } = await db.query(`
      SELECT p.mime, p.data, p.owner_type, j.show_in_gallery,
        EXISTS (SELECT 1 FROM nl_job_crew jc WHERE jc.job_id=j.id AND jc.user_id=$2) AS on_crew
      FROM nl_photos p LEFT JOIN nl_jobs j ON p.owner_type='job' AND j.id=p.owner_id WHERE p.id=$1`, [req.params.id, user ? user.id : null]);
    const p = rows[0];
    // Office staff see every photo; crew see photos on their own jobs; the public sees gallery photos only
    const isAdmin = !!(user && ['owner', 'admin'].includes(user.role)) || !!(p && p.on_crew);
    if (!p || (!isAdmin && !(p.owner_type === 'job' && p.show_in_gallery))) return res.status(404).send('Not found');
    res.set('Content-Type', p.mime);
    res.set('Cache-Control', isAdmin ? 'private, max-age=3600' : 'public, max-age=86400');
    res.send(p.data);
  } catch (e) { next(e); }
});

// ---------- Customer-facing quote ----------
async function loadQuote(token) {
  const { rows } = await db.query(`
    SELECT q.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone, c.address AS client_address
    FROM nl_quotes q LEFT JOIN nl_clients c ON c.id=q.client_id WHERE q.token=$1`, [token]);
  return rows[0];
}

router.get('/q/:token', async (req, res, next) => {
  try {
    const quote = await loadQuote(req.params.token);
    if (!quote || quote.status === 'draft') return res.status(404).render('error', { message: 'This estimate isn’t available.' });
    const flash = { accepted: 'Thank you! Your estimate is accepted — we’ll be in touch to schedule.', declined: 'Thanks for letting us know. We’ve recorded your response.' }[req.query.r] || null;
    res.render('site/quote', { quote, flash });
  } catch (e) { next(e); }
});

for (const action of ['accept', 'decline']) {
  router.post(`/q/:token/${action}`, async (req, res, next) => {
    try {
      const status = action === 'accept' ? 'accepted' : 'declined';
      const { rows } = await db.query(`UPDATE nl_quotes SET status=$1, responded_at=now(), updated_at=now() WHERE token=$2 AND status='sent' RETURNING id`, [status, req.params.token]);
      if (status === 'accepted' && rows[0]) await markQuoteAccepted(rows[0].id);
      res.redirect(`/q/${req.params.token}?r=${status}`);
    } catch (e) { next(e); }
  });
}

function baseUrl(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

module.exports = router;
module.exports.baseUrl = baseUrl;
module.exports.SERVICE_OPTIONS = SERVICE_OPTIONS;
