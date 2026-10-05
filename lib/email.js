const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const business = () => process.env.BUSINESS_NAME || 'Northline Home & Outdoor';

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shell(inner, baseUrl) {
  const logo = baseUrl ? `<img src="${baseUrl}/img/logo.png" alt="${escapeHtml(business())}" width="150" style="display:block;margin:0 0 22px">` :
    `<div style="font:700 13px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#0b2f21">${escapeHtml(business())}</div>`;
  return `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Georgia,serif;color:#18201b">
  <div style="max-width:580px;margin:0 auto;padding:32px 24px">
    ${logo}${inner}
    <p style="margin:30px 0 0;padding-top:16px;border-top:1px solid #ddd5c4;font:12px Arial,sans-serif;color:#6f776f;letter-spacing:.12em;text-transform:uppercase">Clean • Reliable • Professional</p>
  </div></body></html>`;
}

function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#b8975a;color:#0b2f21;text-decoration:none;font:700 13px Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:14px 24px;border-radius:999px">${label}</a>`;
}

function renderEmail({ heading, body, clientName, baseUrl }) {
  const paragraphs = escapeHtml(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return shell(`<h1 style="font-size:26px;margin:0 0 18px;color:#0b2f21">${escapeHtml(heading)}</h1>
    ${clientName ? `<p style="margin:0 0 14px">Hi ${escapeHtml(clientName.split(' ')[0])},</p>` : ''}
    ${paragraphs}
    ${baseUrl ? `<p style="margin:22px 0 0">${button(baseUrl + '/estimate', 'Get a free estimate')}</p>` : ''}
    <p style="margin:22px 0 0;font:12px Arial,sans-serif;color:#6f776f">You're receiving this because you're a ${escapeHtml(business())} client. Reply to this email to unsubscribe.</p>`, baseUrl);
}

// Builds a "Name <address>" sender Resend accepts from whatever EMAIL_FROM holds
// (a bare address, a name + address, stray quotes...). Returns null if there's no usable address.
function fromAddress() {
  const raw = String(process.env.EMAIL_FROM || '').trim().replace(/^["']|["']$/g, '');
  const m = raw.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+\.[^<>\s]+)\s*>$/) || raw.match(/^()([^<>\s]+@[^<>\s]+\.[^<>\s]+)$/);
  if (!m) return null;
  const name = (m[1].trim().replace(/["<>]/g, '') || business()).trim();
  return `${name} <${m[2]}>`;
}

async function send(msg) {
  if (!resend) return { ok: false, preview: true };
  const from = fromAddress();
  if (!from) throw new Error('the sender address isn’t set up — add EMAIL_FROM in Render, e.g. Northline <hello@northlinehomeandoutdoors.com>');
  const { error } = await resend.emails.send({ from, ...msg });
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Sends one email per recipient so clients never see each other's addresses.
async function sendBulk({ subject, heading, body, recipients, baseUrl }) {
  if (!resend) return { sent: 0, preview: true, message: 'RESEND_API_KEY is not set, so nothing was sent (preview only).' };
  let sent = 0; const errors = [];
  for (const r of recipients) {
    try { await send({ to: r.email, subject, html: renderEmail({ heading, body, clientName: r.name, baseUrl }) }); sent++; }
    catch (e) { errors.push(`${r.email}: ${e.message}`); }
  }
  return { sent, errors, preview: false };
}

async function sendQuote({ quote, to, name, link, baseUrl }) {
  const html = shell(`<h1 style="font-size:26px;margin:0 0 18px;color:#0b2f21">Your estimate is ready</h1>
    <p style="margin:0 0 14px">Hi ${escapeHtml((name || '').split(' ')[0] || 'there')},</p>
    <p style="margin:0 0 14px;line-height:1.6">Thank you for considering ${escapeHtml(business())}. Your estimate <strong>${escapeHtml(quote.number)}</strong>${quote.title ? ` for <strong>${escapeHtml(quote.title)}</strong>` : ''} comes to <strong>$${Number(quote.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.</p>
    <p style="margin:0 0 22px;line-height:1.6">You can review the details and accept it online:</p>
    <p style="margin:0 0 22px">${button(link, 'View your estimate')}</p>
    <p style="margin:0;line-height:1.6">Just reply to this email with any questions.</p>`, baseUrl);
  return send({ to, subject: `Your estimate from ${business()} — ${quote.number}`, html, reply_to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL });
}

// A plain one-to-one email to a customer, written in the admin. Replies go to your inbox.
async function sendMessage({ to, name, subject, body, baseUrl }) {
  const paragraphs = escapeHtml(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const html = shell(`${name ? `<p style="margin:0 0 14px">Hi ${escapeHtml(name.split(' ')[0])},</p>` : ''}${paragraphs}`, baseUrl);
  return send({ to, subject, html, text: body, reply_to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL });
}

async function notifyNewRequest(r) {
  const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
  if (!resend || !to) return;
  const rows = [['Service', r.service], ['Phone', r.phone], ['Email', r.email], ['Address', r.address], ['Photos', r.photos]]
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6f776f;font:13px Arial">${k}</td><td style="padding:6px 0;font:15px Arial">${escapeHtml(v)}</td></tr>`).join('');
  const html = shell(`<h1 style="font-size:24px;margin:0 0 16px;color:#0b2f21">New estimate request: ${escapeHtml(r.name)}</h1>
    <table>${rows}</table>
    ${r.description ? `<p style="margin:16px 0;line-height:1.6;font:15px Arial">${escapeHtml(r.description)}</p>` : ''}
    <p style="margin:20px 0 0">${button(`${r.baseUrl}/admin/requests/${r.id}`, 'Open request')}</p>`, r.baseUrl);
  return send({ to, subject: `New estimate request — ${r.name} (${r.service})`, html, reply_to: r.email });
}

async function notifyNewApplication(a) {
  const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
  if (!resend || !to) return;
  const html = shell(`<h1 style="font-size:24px;margin:0 0 16px;color:#0b2f21">New job application: ${escapeHtml(a.name)}</h1>
    <p style="font:15px Arial;line-height:1.6;margin:0 0 6px">Position: <strong>${escapeHtml(a.position)}</strong></p>
    <p style="font:15px Arial;line-height:1.6;margin:0">${escapeHtml(a.phone)} · ${escapeHtml(a.email)}</p>
    <p style="margin:20px 0 0">${button(`${a.baseUrl}/admin/applicants/${a.id}`, 'Open application')}</p>`, a.baseUrl);
  return send({ to, subject: `New application — ${a.name} (${a.position})`, html, reply_to: a.email });
}

module.exports = { notifyNewApplication, sendBulk, sendQuote, sendMessage, notifyNewRequest, renderEmail, enabled: () => !!resend && !!fromAddress(), fromAddress };
