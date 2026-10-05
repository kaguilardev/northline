// Builds a branded PDF of an estimate, matching the customer-facing quote page.
const path = require('path');
const PDFDocument = require('pdfkit');
const { money, POLICY } = require('./pricing');

const C = { green: '#0b2f21', table: '#2a4a3a', gold: '#b8975a', goldDeep: '#9e7b42', ink: '#18201b', muted: '#6f776f', line: '#ddd5c4', stripe: '#f8f5ee' };
const LOGO = path.join(__dirname, '..', 'public', 'img', 'logo.png');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
const STATUS = { draft: 'Draft', sent: 'Awaiting approval', accepted: 'Accepted', declined: 'Declined' };

function quotePdf(quote, out) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 54, bufferPages: true, info: { Title: `Estimate ${quote.number}`, Author: process.env.BUSINESS_NAME || 'Northline Home & Outdoor' } });
  doc.pipe(out);
  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 40;

  // ── Header: logo left, estimate number right
  doc.image(LOGO, L, 48, { height: 64 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.goldDeep).text('ESTIMATE', L, 52, { width: W, align: 'right', characterSpacing: 2 });
  doc.font('Times-Bold').fontSize(22).fillColor(C.green).text(quote.number || '', L, 66, { width: W, align: 'right' });
  const issued = `Issued ${fmtDate(quote.sent_at || quote.created_at)}${quote.valid_until ? ` · Valid until ${fmtDate(quote.valid_until)}` : ''}`;
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(issued, L, 94, { width: W, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.green).text((STATUS[quote.status] || quote.status).toUpperCase(), L, 108, { width: W, align: 'right', characterSpacing: 1 });
  doc.moveTo(L, 128).lineTo(R, 128).lineWidth(2).strokeColor(C.gold).stroke();

  // ── Prepared for / Project
  let y = 148;
  const col = W / 2;
  const label = (t, x) => doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.goldDeep).text(t, x, y, { characterSpacing: 1.5 });
  label('PREPARED FOR', L); label('PROJECT', L + col);
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(C.ink).text(quote.client_name || 'Customer', L, y + 15, { width: col - 16 });
  const contact = [quote.client_address, [quote.client_email, quote.client_phone].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  if (contact) doc.font('Helvetica').fontSize(10).fillColor(C.muted).text(contact, { width: col - 16, lineGap: 1 });
  const leftEnd = doc.y;
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(C.ink).text(quote.title || 'Home & outdoor services', L + col, y + 15, { width: col });
  y = Math.max(leftEnd, doc.y) + 24;

  // ── Line items
  const amtW = 110;
  const descW = W - amtW - 28;
  const head = () => {
    doc.rect(L, y, W, 26).fill(C.table);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
      .text('DESCRIPTION', L + 14, y + 9, { characterSpacing: 1 })
      .text('AMOUNT', R - amtW - 14, y + 9, { width: amtW, align: 'right', characterSpacing: 1 });
    y += 26;
  };
  head();
  (quote.items || []).forEach((it, i) => {
    doc.font('Helvetica-Bold').fontSize(10.5);
    const h1 = doc.heightOfString(it.label, { width: descW });
    doc.font('Helvetica').fontSize(9.5);
    const h2 = it.detail ? doc.heightOfString(it.detail, { width: descW }) + 3 : 0;
    const rowH = Math.max(h1 + h2 + 22, 36);
    if (y + rowH > bottom()) { doc.addPage(); y = doc.page.margins.top; head(); }
    if (i % 2 === 1) doc.rect(L, y, W, rowH).fill(C.stripe);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.ink).text(it.label, L + 14, y + 11, { width: descW });
    if (it.detail) doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(it.detail, L + 14, y + 11 + h1 + 3, { width: descW });
    doc.font('Helvetica').fontSize(10.5).fillColor(C.ink).text(money(it.amount), R - amtW - 14, y + 11, { width: amtW, align: 'right' });
    y += rowH;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.75).strokeColor(C.line).stroke();
  });

  // ── Total
  if (y + 50 > bottom()) { doc.addPage(); y = doc.page.margins.top; }
  y += 14;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted).text('TOTAL', L, y + 7, { width: W - amtW - 28, align: 'right', characterSpacing: 1.5 });
  doc.font('Times-Bold').fontSize(20).fillColor(C.green).text(money(quote.total), R - amtW - 14, y, { width: amtW, align: 'right' });
  y += 40;

  // ── Notes + policy
  const block = (text, opts) => {
    doc.font(opts.font).fontSize(opts.size);
    const h = doc.heightOfString(text, { width: W });
    if (y + h > bottom()) { doc.addPage(); y = doc.page.margins.top; }
    doc.fillColor(opts.color).text(text, L, y, { width: W, lineGap: 2 });
    y = doc.y + (opts.after || 10);
  };
  if (quote.notes) block(quote.notes, { font: 'Helvetica', size: 10.5, color: C.ink, after: 18 });
  block(POLICY.general, { font: 'Helvetica', size: 8.5, color: C.muted });
  if (quote.paint_note) block(`Paint not included. ${POLICY.paint}`, { font: 'Helvetica', size: 8.5, color: C.muted });

  // ── Footer on every page
  const phone = process.env.BUSINESS_PHONE, email = process.env.BUSINESS_EMAIL;
  const foot = [process.env.BUSINESS_NAME || 'Northline Home & Outdoor', phone, email].filter(Boolean).join('  ·  ');
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // let the footer sit below the text area without adding a page
    const fy = doc.page.height - 50;
    doc.moveTo(L, fy - 8).lineTo(R, fy - 8).lineWidth(0.75).strokeColor(C.line).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(foot, L, fy, { width: W / 2 + 60, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.goldDeep).text('CLEAN • RELIABLE • PROFESSIONAL', L, fy, { width: W, align: 'right', characterSpacing: 1, lineBreak: false });
  }
  doc.end();
}

module.exports = { quotePdf };
