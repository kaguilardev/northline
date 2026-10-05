const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderEmail({ heading, body, clientName }) {
  const business = process.env.BUSINESS_NAME || 'Northline Landscaping';
  const paragraphs = escapeHtml(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f3f1ea;font-family:Georgia,serif;color:#1f2a1f">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font:600 13px/1 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#3f6b3a">${escapeHtml(business)}</div>
    <h1 style="font-size:26px;margin:14px 0 18px">${escapeHtml(heading)}</h1>
    ${clientName ? `<p style="margin:0 0 14px">Hi ${escapeHtml(clientName.split(' ')[0])},</p>` : ''}
    ${paragraphs}
    <p style="margin:28px 0 0;font:13px Arial,sans-serif;color:#6b7266">You're receiving this because you're a ${escapeHtml(business)} client. Reply to this email to unsubscribe.</p>
  </div></body></html>`;
}

// Sends one email per recipient so clients never see each other's addresses.
async function sendBulk({ subject, heading, body, recipients }) {
  if (!resend) {
    return { sent: 0, preview: true, message: 'RESEND_API_KEY is not set, so nothing was sent (preview only).' };
  }
  let sent = 0;
  const errors = [];
  for (const r of recipients) {
    try {
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: r.email,
        subject,
        html: renderEmail({ heading, body, clientName: r.name }),
      });
      if (error) errors.push(`${r.email}: ${error.message}`); else sent++;
    } catch (e) {
      errors.push(`${r.email}: ${e.message}`);
    }
  }
  return { sent, errors, preview: false };
}

module.exports = { sendBulk, renderEmail };
