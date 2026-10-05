// Sign-in tracking, lockouts, spam protection for the public forms, blocked IPs and server health.
const db = require('../db');

const LOCK = { perEmail: 5, perIp: 15, minutes: 15 };         // wrong passwords before a 15-minute lockout
const FORM_LIMIT = { count: 5, minutes: 10 };                  // public form submissions per IP
const KEEP_DAYS = 90;

const ipOf = (req) => String(req.ip || '').replace(/^::ffff:/, '').slice(0, 64);
const agent = (req) => String(req.get('user-agent') || '').slice(0, 300);

// ── Sign-in events ──
async function logAuth(req, event, email, userId) {
  try {
    await db.query('INSERT INTO nl_auth_events (event, email, user_id, ip, user_agent) VALUES ($1,$2,$3,$4,$5)',
      [event, email ? String(email).toLowerCase().slice(0, 200) : null, userId || null, ipOf(req), agent(req)]);
  } catch (e) { console.error('auth log failed:', e.message); }
}

// Locked if this email, or this IP, has had too many wrong passwords recently
async function loginLocked(req, email) {
  const { rows } = await db.query(`SELECT
      count(*) FILTER (WHERE lower(email)=lower($1))::int AS by_email,
      count(*) FILTER (WHERE ip=$2)::int AS by_ip
    FROM nl_auth_events WHERE event='login_fail' AND created_at > now() - make_interval(mins => $3)
      AND created_at > COALESCE((SELECT max(created_at) FROM nl_auth_events WHERE event='login_ok' AND lower(email)=lower($1)), 'epoch')`,
  [email || '', ipOf(req), LOCK.minutes]);
  return rows[0].by_email >= LOCK.perEmail || rows[0].by_ip >= LOCK.perIp;
}

// ── Public forms: spam + flooding ──
const hits = new Map(); // ip -> [timestamps]
function tooMany(req) {
  const ip = ipOf(req), now = Date.now(), win = FORM_LIMIT.minutes * 60000;
  const recent = (hits.get(ip) || []).filter((t) => now - t < win);
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return recent.length > FORM_LIMIT.count;
}

async function logSpam(req, form, reason, body = {}) {
  try {
    const sample = [body.name, body.company, body.email, body.phone].filter(Boolean).join(' · ').slice(0, 300) || null;
    await db.query('INSERT INTO nl_spam_events (form, reason, ip, user_agent, sample) VALUES ($1,$2,$3,$4,$5)', [form, reason, ipOf(req), agent(req), sample]);
  } catch (e) { console.error('spam log failed:', e.message); }
}

// ── Blocked IPs (refreshed whenever the list changes) ──
let blocked = new Set();
async function refreshBlocked() { blocked = new Set((await db.query('SELECT ip FROM nl_blocked_ips')).rows.map((r) => r.ip)); }
const isBlocked = (req) => blocked.has(ipOf(req));

// Blocked IPs can still read the site, but can't sign in or send forms
function blockMiddleware(req, res, next) {
  if (req.method !== 'POST' || !isBlocked(req)) return next();
  logSpam(req, req.path, 'blocked_ip');
  return res.status(403).render('error', { message: 'Sorry, we can’t accept this request. Please call or email us instead.' });
}

// ── Server health: memory sampled every minute for the last 6 hours ──
const samples = [];
function sample() {
  const m = process.memoryUsage();
  samples.push({ t: Date.now(), rss: m.rss, heap: m.heapUsed });
  if (samples.length > 360) samples.shift();
}
function startHealth() { sample(); setInterval(sample, 60000).unref(); }

function health() {
  const m = process.memoryUsage();
  let trend = 'steady', note = 'Memory use is stable.';
  if (samples.length >= 30) {
    const third = Math.floor(samples.length / 3);
    const avg = (arr) => arr.reduce((s, x) => s + x.heap, 0) / arr.length;
    const growth = (avg(samples.slice(-third)) - avg(samples.slice(0, third))) / avg(samples.slice(0, third));
    if (growth > 0.35) { trend = 'climbing'; note = `Memory has grown ${Math.round(growth * 100)}% over the last ${Math.round(samples.length / 60 * 10) / 10} hours without levelling off — possible leak. A redeploy on Render clears it; tell your developer if it keeps happening.`; }
    else if (growth > 0.15) { trend = 'rising'; note = 'Memory is rising a little. Normal after busy periods; worth a look if it keeps climbing.'; }
  } else note = `Collecting data — the trend shows after 30 minutes (${samples.length} of 30 so far).`;
  return { rss: m.rss, heap: m.heapUsed, uptime: process.uptime(), node: process.version, samples, trend, note, cacheEntries: hits.size };
}

async function prune() {
  await db.query(`DELETE FROM nl_auth_events WHERE created_at < now() - make_interval(days => $1)`, [KEEP_DAYS]);
  await db.query(`DELETE FROM nl_spam_events WHERE created_at < now() - make_interval(days => $1)`, [KEEP_DAYS]);
}

module.exports = { LOCK, logAuth, loginLocked, tooMany, logSpam, refreshBlocked, isBlocked, blockMiddleware, startHealth, health, prune, ipOf };
