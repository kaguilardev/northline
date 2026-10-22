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
    rates: Object.fromEntries(pricing.CONCRETE_RATES.map((r) => [r.key, r.rate])),
    extras: Object.fromEntries(pricing.CONCRETE_EXTRAS.map((x) => [x.key, x.rate])),
    minimum: pricing.MINIMUM_JOB.amount,
  };
}

const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v) * 100) / 100));

// A saved price book from before the concrete switch (lawn / paint keys) has no `rates` and changes nothing.
// A blank saved value clears that rate, so the owner can leave one to price by hand.
function applyPricebook(pb) {
  if (!pb || !pb.rates) return;
  for (const r of pricing.CONCRETE_RATES) if (r.key in pb.rates) r.rate = n(pb.rates[r.key]);
  for (const x of pricing.CONCRETE_EXTRAS) if (pb.extras && x.key in pb.extras) x.rate = n(pb.extras[x.key]);
  if ('minimum' in pb) pricing.MINIMUM_JOB.amount = n(pb.minimum);
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
