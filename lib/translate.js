// English ⇄ Español. Pages are written in English; when a visitor picks Spanish, the rendered HTML is
// translated through DeepL. Every sentence is translated once and saved (memory + database), so
// pages stay fast and the monthly DeepL allowance is barely touched.
const crypto = require('crypto');
const { parse } = require('node-html-parser');
const db = require('../db');

const LANGS = { en: 'English', es: 'Español' };
const COOKIE = 'nl_lang';
const KEY = () => process.env.DEEPL_API_KEY || '';

// Elements whose inner HTML is translated as one piece (keeps sentences + inline bold/links together)
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'li', 'dt', 'dd', 'td', 'th', 'label', 'legend', 'button', 'a', 'option',
  'figcaption', 'blockquote', 'summary', 'small', 'span', 'div', 'strong', 'em', 'title']);
// Inline tags allowed inside a unit. Icons (svg) are not: their text is translated on its own so the icon is never sent.
const INLINE = new Set(['a', 'strong', 'em', 'b', 'i', 'small', 'br', 'span', 'img']);
const SKIP = new Set(['script', 'style', 'svg', 'textarea', 'code', 'noscript']);
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');
const memory = new Map(); // `${lang}:${formality}:${hash}` -> text
const MEMORY_MAX = 20000;

const hasWords = (s) => /[A-Za-z]{2,}/.test(s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ''));

// A node is a translation unit if it has its own text and contains only inline markup.
function isUnit(el) {
  if (!BLOCKS.has(el.rawTagName)) return false;
  if (!el.childNodes.some((c) => c.nodeType === 3 && c.rawText.trim())) return false;
  return el.querySelectorAll('*').every((c) => INLINE.has(c.rawTagName) && !BLOCKS_WITH_CONTENT(c));
}
// an inline child that itself wraps blocks (rare) disqualifies the parent
function BLOCKS_WITH_CONTENT(c) { return ['div', 'p', 'ul', 'ol', 'table'].includes(c.rawTagName); }

function collect(root) {
  const units = []; const attrs = [];
  (function walk(el) {
    for (const c of el.childNodes) {
      if (c.nodeType !== 1) continue;
      const tag = c.rawTagName;
      if (SKIP.has(tag) || c.getAttribute('translate') === 'no' || c.classList?.contains('notranslate')) continue;
      for (const a of ATTRS) { const v = c.getAttribute(a); if (v && hasWords(v)) attrs.push({ el: c, a, text: v }); }
      if (tag === 'input' && ['submit', 'button'].includes(c.getAttribute('type')) && hasWords(c.getAttribute('value') || '')) attrs.push({ el: c, a: 'value', text: c.getAttribute('value') });
      if (tag === 'meta' && c.getAttribute('name') === 'description') attrs.push({ el: c, a: 'content', text: c.getAttribute('content') || '' });
      if (isUnit(c)) { const h = c.innerHTML.trim(); if (hasWords(h)) units.push({ el: c, text: h }); continue; }
      // loose text sitting next to block children (e.g. "Hi, Marcus" beside a <div>) is translated piece by piece
      for (const t of c.childNodes) if (t.nodeType === 3 && hasWords(t.rawText) && t.rawText.trim().length > 1) units.push({ node: t, text: t.rawText.trim() });
      walk(c);
    }
  })(root);
  return { units, attrs };
}

// Prices and the business name must come back exactly as written ("$49", not "49 $"), so they're
// wrapped in do-not-translate markers on the way to DeepL and unwrapped after.
const KEEP = /(\$\d[\d,]*(?:\.\d+)?(?:\s?[–-]\s?\$?\d[\d,]*(?:\.\d+)?)?\+?|Northline Home &(?:amp;)? Outdoor|Northline Clean|\bNorthline\b|ft²)/g;
const protect = (t) => t.replace(KEEP, '<span translate="no" data-k="1">$1</span>');
const unprotect = (t) => t.replace(/<span translate="no" data-k="1">([\s\S]*?)<\/span>/g, '$1');

// House terms DeepL gets wrong for a home-services business (e.g. "crew" as a ship's crew)
const TERMS = [[/\bTripulaci[oó]n\b/g, 'Equipo'], [/\btripulaci[oó]n\b/g, 'equipo'], [/\bTripulaciones\b/g, 'Equipos'], [/\btripulaciones\b/g, 'equipos'],
  [/\btripulante(s?)\b/g, 'miembro$1 del equipo'], [/\bpresupuestos? de salida\b/g, (m) => m.replace('de salida', 'iniciales')], [/\bprecios de salida\b/g, 'precios iniciales']];
const fixTerms = (t) => TERMS.reduce((acc, [re, to]) => acc.replace(re, to), t);

async function deepl(texts, formality) {
  const key = KEY();
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const r = await fetch(`https://${host}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texts.slice(i, i + 50).map(protect), source_lang: 'EN', target_lang: 'ES', tag_handling: 'html', formality }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`DeepL ${r.status}: ${(await r.text()).slice(0, 200)}`);
    out.push(...(await r.json()).translations.map((t) => fixTerms(unprotect(t.text))));
  }
  return out;
}

// Look up saved translations; send only the new ones to DeepL.
async function translateAll(texts, formality) {
  const uniq = [...new Set(texts)];
  const result = new Map();
  const missing = [];
  for (const t of uniq) { const m = memory.get(`es:${formality}:${hash(t)}`); if (m != null) result.set(t, m); else missing.push(t); }
  if (missing.length) {
    const { rows } = await db.query('SELECT hash, result FROM nl_translations WHERE lang=$1 AND formality=$2 AND hash = ANY($3)',
      ['es', formality, missing.map(hash)]);
    const byHash = new Map(rows.map((r) => [r.hash, r.result]));
    const fresh = [];
    for (const t of missing) { const v = byHash.get(hash(t)); if (v != null) result.set(t, v); else fresh.push(t); }
    if (fresh.length) {
      const done = await deepl(fresh, formality);
      for (let i = 0; i < fresh.length; i++) {
        result.set(fresh[i], done[i]);
        await db.query(`INSERT INTO nl_translations (lang, formality, hash, source, result) VALUES ('es',$1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [formality, hash(fresh[i]), fresh[i], done[i]]);
      }
    }
    if (memory.size > MEMORY_MAX) memory.clear();
    for (const t of missing) memory.set(`es:${formality}:${hash(t)}`, result.get(t));
  }
  return result;
}

async function translateHtml(html, formality) {
  const root = parse(html, { comment: true, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const { units, attrs } = collect(root);
  if (!units.length && !attrs.length) return html;
  const map = await translateAll(units.map((u) => u.text).concat(attrs.map((a) => a.text)), formality);
  for (const u of units) {
    const t = map.get(u.text); if (t == null) continue;
    if (u.el) u.el.set_content(t); else u.node.rawText = u.node.rawText.replace(u.text, t);
  }
  for (const a of attrs) { const t = map.get(a.text); if (t != null) a.el.setAttribute(a.a, t); }
  const htmlEl = root.querySelector('html'); if (htmlEl) htmlEl.setAttribute('lang', 'es');
  return root.toString();
}

// Pages that can be shown in Spanish: the public site, crew screens and sign-in pages. The office admin stays English.
const translatable = (path) => !path.startsWith('/admin');

// Middleware: ?lang=es / ?lang=en switches and remembers the choice; Spanish pages are translated after rendering.
function middleware(req, res, next) {
  if (req.query.lang && LANGS[req.query.lang]) {
    res.cookie(COOKIE, req.query.lang, { maxAge: 365 * 864e5, sameSite: 'lax', httpOnly: true });
    const url = new URL(req.originalUrl, 'http://x'); url.searchParams.delete('lang');
    return res.redirect(url.pathname + url.search + url.hash);
  }
  const fromCookie = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${COOKIE}=(\\w+)`));
  const lang = fromCookie && LANGS[fromCookie[1]] ? fromCookie[1] : 'en';
  res.locals.lang = lang;
  res.locals.langs = LANGS;
  res.locals.langUrl = (code) => { const u = new URL(req.originalUrl, 'http://x'); u.searchParams.set('lang', code); return u.pathname + u.search; };
  res.locals.showLangToggle = translatable(req.path) && !!KEY();
  if (lang === 'en' || !KEY() || !translatable(req.path)) return next();

  // Crew are teammates (informal "tú"); customers get the polite "usted".
  const formality = req.path.startsWith('/crew') ? 'prefer_less' : 'prefer_more';
  const render = res.render.bind(res);
  res.render = (view, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    render(view, opts, async (err, html) => {
      if (err) return cb ? cb(err) : req.next(err);
      let out = html;
      try { out = await translateHtml(html, formality); } catch (e) { console.error('translation failed, showing English:', e.message); }
      if (cb) return cb(null, out);
      res.send(out);
    });
  };
  next();
}

module.exports = { middleware, translateHtml, LANGS };
