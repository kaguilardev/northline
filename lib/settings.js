// Owner-editable settings, saved in the database: business contact details and the price book.
// Prices are applied directly onto the objects in lib/pricing.js, so the website, quote builder
// and everything else that reads the price book picks up a change immediately.
const db = require('../db');
const pricing = require('./pricing');

const clone = (v) => JSON.parse(JSON.stringify(v));
const DEFAULTS = {
  pricebook: snapshot(),
  business: { phone: process.env.BUSINESS_PHONE || '', email: process.env.BUSINESS_EMAIL || '', notify: process.env.NOTIFY_EMAIL || '' },
};
let business = clone(DEFAULTS.business);
let contactRef = null; // app.locals.contact, updated in place

// The editable numbers, keyed so a saved price book survives items being reordered
function snapshot() {
  return {
    lawn: Object.fromEntries(pricing.LAWN_PACKAGES.map((p) => [p.key, clone(p.prices)])),
    addons: Object.fromEntries(pricing.OUTDOOR_ADDONS.map((a) => [a.key, a.from])),
    conditions: Object.fromEntries(pricing.LAWN_ADJUSTMENTS.map((a) => [a.key, a.levels ? clone(a.levels) : [a.low, a.high]])),
    paint: Object.fromEntries(pricing.PAINT_PACKAGES.map((p) => [p.key, p.from])),
    paintAddons: Object.fromEntries(pricing.PAINT_ADDONS.map((a) => [a.key, a.from])),
  };
}

const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v) * 100) / 100));

function applyPricebook(pb) {
  for (const p of pricing.LAWN_PACKAGES) {
    const saved = pb.lawn && pb.lawn[p.key];
    if (saved) for (const size of Object.keys(p.prices)) if (saved[size]) p.prices[size] = [n(saved[size][0]) ?? p.prices[size][0], n(saved[size][1]) ?? p.prices[size][1]];
    p.from = p.prices.small[0];
  }
  for (const a of pricing.OUTDOOR_ADDONS) if (pb.addons && n(pb.addons[a.key]) != null) a.from = n(pb.addons[a.key]);
  for (const a of pricing.LAWN_ADJUSTMENTS) {
    const v = pb.conditions && pb.conditions[a.key];
    if (!v) continue;
    const vals = v.map(n);
    if (vals.some((x) => x == null)) continue;
    if (a.levels) a.levels = vals;
    a.low = vals[0]; a.high = vals[vals.length - 1];
  }
  for (const p of pricing.PAINT_PACKAGES) {
    if (!pb.paint || !(p.key in pb.paint)) continue;
    p.from = n(pb.paint[p.key]);
    p.price = p.from == null ? 'Custom Quote' : `${pricing.money(p.from)}+`;
  }
  for (const a of pricing.PAINT_ADDONS) if (pb.paintAddons && n(pb.paintAddons[a.key]) != null) a.from = n(pb.paintAddons[a.key]);
}

async function get(key) {
  const { rows } = await db.query('SELECT value FROM nl_settings WHERE key=$1', [key]);
  return rows[0] ? rows[0].value : null;
}
async function put(key, value, by) {
  await db.query(`INSERT INTO nl_settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [key, JSON.stringify(value), by || null]);
}

async function load(contact) {
  contactRef = contact;
  const pb = await get('pricebook');
  if (pb) applyPricebook(pb);
  const b = await get('business');
  if (b) setBusiness(b);
  else if (contactRef) Object.assign(contactRef, { phone: business.phone, email: business.email });
}

function setBusiness(b) {
  business = { phone: String(b.phone || '').trim().slice(0, 40), email: String(b.email || '').trim().slice(0, 200), notify: String(b.notify || '').trim().slice(0, 200) };
  if (contactRef) Object.assign(contactRef, { phone: business.phone, email: business.email });
}

async function savePricebook(pb, by) { applyPricebook(pb); await put('pricebook', snapshot(), by); }
async function resetPricebook(by) { applyPricebook(DEFAULTS.pricebook); await db.query(`DELETE FROM nl_settings WHERE key='pricebook'`); return by; }
async function saveBusiness(b, by) { setBusiness(b); await put('business', business, by); }
async function lastChange(key) {
  const { rows } = await db.query(`SELECT s.updated_at, a.name, a.email FROM nl_settings s LEFT JOIN nl_admins a ON lower(a.email)=lower(s.updated_by) WHERE s.key=$1`, [key]);
  return rows[0] || null;
}

module.exports = {
  load, savePricebook, resetPricebook, saveBusiness, lastChange,
  business: () => business,
  notifyEmail: () => business.notify || process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '',
};
