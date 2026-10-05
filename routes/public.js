const express = require('express');
const db = require('../db');
const pricing = require('../lib/pricing');
const { upload, savePhotos } = require('../lib/photos');
const { notifyNewRequest } = require('../lib/email');
const { markQuoteAccepted } = require('../lib/pipeline');

const router = express.Router();

const SERVICE_OPTIONS = [
  'Lawn Care (recurring)', 'Yard / Leaf Cleanup', 'Pressure Washing', 'Interior Painting', 'Exterior Painting',
  'Cabinets / Trim / Doors', 'Deck / Fence Staining', 'Decks & Fences', 'Remodeling', 'Multiple services / Not sure',
];
const SERVICE_PREFILL = {
  landscaping: 'Lawn Care (recurring)', painting: 'Interior Painting', pressure: 'Pressure Washing',
  remodeling: 'Remodeling', decks: 'Decks & Fences',
};

router.get('/', (req, res) => res.render('site/home'));
router.get('/services', (req, res) => res.render('site/services'));
router.get('/lawn-care', (req, res) => res.render('site/lawn-care'));
router.get('/painting', (req, res) => res.render('site/painting'));
router.get('/pressure-washing', (req, res) => res.render('site/pressure-washing'));
router.get('/about', (req, res) => res.render('site/about'));
router.get('/service-area', (req, res) => res.render('site/service-area'));

router.get('/gallery', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT j.id, j.service, j.package, j.customer_review,
        (SELECT id FROM nl_photos WHERE owner_type='job' AND owner_id=j.id AND kind='before' ORDER BY id LIMIT 1) AS before,
        (SELECT id FROM nl_photos WHERE owner_type='job' AND owner_id=j.id AND kind='after'  ORDER BY id LIMIT 1) AS after
      FROM nl_jobs j WHERE j.show_in_gallery ORDER BY j.job_date DESC NULLS LAST, j.id DESC`);
    res.render('site/gallery', { projects: rows.filter((r) => r.before || r.after) });
  } catch (e) { next(e); }
});

// ---------- Estimate request form ----------
router.get('/estimate', (req, res) => {
  res.render('site/estimate', { error: null, form: { service: SERVICE_PREFILL[req.query.service] || '' }, serviceOptions: SERVICE_OPTIONS });
});

router.post('/estimate', (req, res, next) => {
  upload.array('photos', 8)(req, res, async (err) => {
    const form = req.body || {};
    const fail = (msg) => res.status(400).render('site/estimate', { error: msg, form, serviceOptions: SERVICE_OPTIONS });
    if (err) return fail(err.code === 'LIMIT_FILE_SIZE' ? 'One of the photos is too large (10 MB max each).' : 'We couldn’t upload those photos. Please try again with up to 8 images.');
    if (form.website) return res.redirect('/estimate/thanks'); // spam bot filled the hidden field
    const name = (form.name || '').trim();
    if (!name || !form.phone || !form.email || !form.address || !form.service) return fail('Please fill in all the required fields.');
    try {
      const { rows } = await db.query(
        `INSERT INTO nl_requests (name, phone, email, address, service, preferred_date, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [name, form.phone.trim(), form.email.trim(), form.address.trim(), form.service, form.preferred_date || null, (form.description || '').trim() || null]);
      const id = rows[0].id;
      await savePhotos('request', id, req.files || []);
      notifyNewRequest({ id, name, service: form.service, phone: form.phone, email: form.email, address: form.address,
        description: form.description, photos: (req.files || []).length, baseUrl: baseUrl(req) }).catch((e) => console.error('notify failed:', e.message));
      req.session.lastRequestName = name;
      res.redirect('/estimate/thanks');
    } catch (e) { next(e); }
  });
});

router.get('/estimate/thanks', (req, res) => res.render('site/thanks', { name: req.session.lastRequestName || '' }));

// ---------- Photos ----------
router.get('/photo/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT p.mime, p.data, p.owner_type, j.show_in_gallery
      FROM nl_photos p LEFT JOIN nl_jobs j ON p.owner_type='job' AND j.id=p.owner_id WHERE p.id=$1`, [req.params.id]);
    const p = rows[0];
    const isAdmin = !!(req.session && req.session.admin);
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
