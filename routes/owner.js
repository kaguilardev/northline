// Prices (owner edits, admin can view), Settings and Security (owner only).
const express = require('express');
const db = require('../db');
const pricing = require('../lib/pricing');
const settings = require('../lib/settings');
const security = require('../lib/security');
const { requireAdmin, requireOwner } = require('../lib/auth');
const { enabled: emailEnabled, fromAddress } = require('../lib/email');

const router = express.Router();
router.use('/admin/prices', requireAdmin);
router.use('/admin/settings', requireOwner);
router.use('/admin/security', requireOwner);
const by = (req) => req.session.user.email;
const flashTo = (res, url, msg) => res.redirect(`${url}?flash=${encodeURIComponent(msg)}`);

// ═════════ Prices ═════════
router.get('/admin/prices', async (req, res, next) => {
  try {
    res.render('admin/prices', { title: 'Prices', p: pricing, canEdit: req.session.user.role === 'owner',
      changed: await settings.lastChange('pricebook'), flash: req.query.flash || null });
  } catch (e) { next(e); }
});

router.post('/admin/prices', requireOwner, async (req, res, next) => {
  try {
    const b = req.body;
    const pb = { lawn: {}, addons: {}, conditions: {}, paint: {}, paintAddons: {} };
    for (const p of pricing.LAWN_PACKAGES) {
      pb.lawn[p.key] = {};
      for (const s of pricing.LAWN_SIZES) pb.lawn[p.key][s.key] = [b[`lawn.${p.key}.${s.key}.lo`], b[`lawn.${p.key}.${s.key}.hi`]];
    }
    for (const a of pricing.OUTDOOR_ADDONS) pb.addons[a.key] = b[`addon.${a.key}`];
    for (const a of pricing.LAWN_ADJUSTMENTS) pb.conditions[a.key] = (a.levels || [0, 0]).map((_, i) => b[`cond.${a.key}.${i}`]);
    for (const p of pricing.PAINT_PACKAGES) pb.paint[p.key] = b[`paint.${p.key}`];
    for (const a of pricing.PAINT_ADDONS) pb.paintAddons[a.key] = b[`paintAddon.${a.key}`];
    await settings.savePricebook(pb, by(req));
    flashTo(res, '/admin/prices', 'Prices saved — the website and quote builder are updated.');
  } catch (e) { next(e); }
});

router.post('/admin/prices/reset', requireOwner, async (req, res, next) => {
  try { await settings.resetPricebook(by(req)); flashTo(res, '/admin/prices', 'Prices are back to the original price list.'); } catch (e) { next(e); }
});

// ═════════ Settings ═════════
async function deeplUsage() {
  const key = process.env.DEEPL_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://${key.endsWith(':fx') ? 'api-free' : 'api'}.deepl.com/v2/usage`, { headers: { Authorization: `DeepL-Auth-Key ${key}` }, signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

router.get('/admin/settings', async (req, res, next) => {
  try {
    const translations = (await db.query('SELECT count(*)::int AS n FROM nl_translations')).rows[0].n;
    res.render('admin/settings', { title: 'Settings', b: settings.business(), flash: req.query.flash || null,
      email: { on: emailEnabled(), hasKey: !!process.env.RESEND_API_KEY, from: fromAddress(), notify: settings.notifyEmail() },
      deepl: { hasKey: !!process.env.DEEPL_API_KEY, usage: await deeplUsage(), saved: translations } });
  } catch (e) { next(e); }
});

router.post('/admin/settings', async (req, res, next) => {
  try {
    const { phone, email, notify } = req.body;
    const bad = [email, notify].find((v) => v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()));
    if (bad) return flashTo(res, '/admin/settings', `“${bad}” doesn’t look like an email address.`);
    await settings.saveBusiness({ phone, email, notify }, by(req));
    flashTo(res, '/admin/settings', 'Settings saved.');
  } catch (e) { next(e); }
});

// ═════════ Security ═════════
router.get('/admin/security', async (req, res, next) => {
  try {
    const showAll = req.query.all === '1';
    const [summary, auth, spam, ips, sessions, team] = await Promise.all([
      db.query(`SELECT
        (SELECT count(*)::int FROM nl_auth_events WHERE event='login_fail' AND created_at > now() - interval '24 hours') AS fails_24h,
        (SELECT count(*)::int FROM nl_auth_events WHERE event='locked' AND created_at > now() - interval '7 days') AS locks_7d,
        (SELECT count(*)::int FROM nl_spam_events WHERE created_at > now() - interval '7 days') AS spam_7d,
        (SELECT count(*)::int FROM nl_auth_events WHERE event IN ('login_fail','locked') AND resolved_at IS NULL)
          + (SELECT count(*)::int FROM nl_spam_events WHERE resolved_at IS NULL) AS open`),
      db.query(`SELECT e.*, a.name FROM nl_auth_events e LEFT JOIN nl_admins a ON a.id=e.user_id
        ${showAll ? '' : `WHERE e.event IN ('login_fail','locked','reset_request') AND e.resolved_at IS NULL`}
        ORDER BY e.created_at DESC LIMIT 100`),
      db.query(`SELECT * FROM nl_spam_events ${showAll ? '' : 'WHERE resolved_at IS NULL'} ORDER BY created_at DESC LIMIT 100`),
      db.query('SELECT * FROM nl_blocked_ips ORDER BY created_at DESC'),
      db.query(`SELECT count(*)::int AS n FROM nl_session WHERE expire > now() AND sess::text LIKE '%"user":{%'`),
      db.query(`SELECT name, email, role, last_login_at FROM nl_admins WHERE active ORDER BY last_login_at DESC NULLS LAST`),
    ]);
    res.render('admin/security', { title: 'Security', s: summary.rows[0], auth: auth.rows, spam: spam.rows, ips: ips.rows,
      sessions: sessions.rows[0].n, team: team.rows, health: security.health(), showAll, myIp: security.ipOf(req), flash: req.query.flash || null });
  } catch (e) { next(e); }
});

router.post('/admin/security/resolve', async (req, res, next) => {
  try {
    const table = req.body.kind === 'spam' ? 'nl_spam_events' : 'nl_auth_events';
    if (req.body.id === 'all') {
      await db.query(`UPDATE nl_spam_events SET resolved_at=now() WHERE resolved_at IS NULL`);
      await db.query(`UPDATE nl_auth_events SET resolved_at=now() WHERE resolved_at IS NULL`);
    } else await db.query(`UPDATE ${table} SET resolved_at=now() WHERE id=$1`, [req.body.id]);
    res.redirect('/admin/security');
  } catch (e) { next(e); }
});

router.post('/admin/security/block', async (req, res, next) => {
  try {
    const ip = String(req.body.ip || '').trim().slice(0, 64);
    if (!ip) return res.redirect('/admin/security');
    if (ip === security.ipOf(req)) return flashTo(res, '/admin/security', 'That’s your own connection — blocking it would lock you out.');
    await db.query(`INSERT INTO nl_blocked_ips (ip, reason, blocked_by) VALUES ($1,$2,$3) ON CONFLICT (ip) DO NOTHING`, [ip, String(req.body.reason || '').slice(0, 200), by(req)]);
    await db.query(`UPDATE nl_spam_events SET resolved_at=now() WHERE ip=$1 AND resolved_at IS NULL`, [ip]);
    await db.query(`UPDATE nl_auth_events SET resolved_at=now() WHERE ip=$1 AND resolved_at IS NULL`, [ip]);
    await security.refreshBlocked();
    flashTo(res, '/admin/security', `Blocked ${ip}. It can still view the website but can’t sign in or send forms.`);
  } catch (e) { next(e); }
});

router.post('/admin/security/unblock', async (req, res, next) => {
  try {
    await db.query('DELETE FROM nl_blocked_ips WHERE ip=$1', [String(req.body.ip || '')]);
    await security.refreshBlocked();
    flashTo(res, '/admin/security', 'Unblocked.');
  } catch (e) { next(e); }
});

module.exports = router;
