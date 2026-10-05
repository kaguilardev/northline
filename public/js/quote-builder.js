(function () {
  var book = JSON.parse(document.getElementById('pricebook').textContent);
  var items = JSON.parse(document.getElementById('initialItems').textContent) || [];
  var rows = document.getElementById('itemRows');
  var fmt = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function render() {
    rows.innerHTML = '';
    if (!items.length) rows.innerHTML = '<tr><td colspan="4" class="muted center">Add items from the price book →</td></tr>';
    items.forEach(function (it, i) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><input data-i="' + i + '" data-k="label" value="' + esc(it.label) + '"></td>' +
        '<td><input data-i="' + i + '" data-k="detail" value="' + esc(it.detail) + '" placeholder="optional"></td>' +
        '<td class="amt"><input data-i="' + i + '" data-k="amount" type="number" step="0.01" value="' + esc(it.amount) + '"></td>' +
        '<td><button type="button" class="x" data-del="' + i + '" title="Remove">×</button></td>';
      rows.appendChild(tr);
    });
    total();
  }
  function total() {
    var t = items.reduce(function (s, it) { return s + (Number(it.amount) || 0); }, 0);
    document.getElementById('total').textContent = fmt(t);
  }
  function add(label, detail, amount, isPaint) {
    items.push({ label: label, detail: detail || '', amount: amount });
    if (isPaint) document.getElementById('paintNote').checked = true;
    render();
    rows.lastChild.classList.add('added'); // brief highlight so you can see it landed
  }
  rows.addEventListener('input', function (e) {
    var i = e.target.dataset.i, k = e.target.dataset.k; if (i == null) return;
    items[i][k] = k === 'amount' ? e.target.value : e.target.value; total();
  });
  rows.addEventListener('click', function (e) {
    if (e.target.dataset.del != null) { items.splice(Number(e.target.dataset.del), 1); render(); }
  });
  document.getElementById('addBlank').addEventListener('click', function () { add('', '', 0); rows.querySelector('tr:last-child input').focus(); });

  // ── Price book tabs (remembers the last one you used)
  var tabs = document.querySelectorAll('.book-tabs [data-tab]');
  function showTab(key) {
    tabs.forEach(function (t) { var on = t.dataset.tab === key; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    document.querySelectorAll('#book .pane').forEach(function (p) { p.hidden = p.dataset.pane !== key; });
    try { sessionStorage.setItem('nl-book-tab', key); } catch (e) { /* ignore */ }
  }
  tabs.forEach(function (t) { t.onclick = function () { showTab(t.dataset.tab); }; });
  var savedTab = null; try { savedTab = sessionStorage.getItem('nl-book-tab'); } catch (e) { /* ignore */ }
  showTab(savedTab || 'lawn');

  // Price choice boxes: pick one before the Add button turns on
  function choices(box, opts, onPick) {
    box.innerHTML = '';
    opts.forEach(function (o, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'choice';
      b.innerHTML = '<strong>' + esc(o.price) + '</strong>' + (o.note ? '<span>' + esc(o.note) + '</span>' : '');
      b.onclick = function () {
        box.querySelectorAll('.choice').forEach(function (c) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); onPick(o.value);
      };
      b.setAttribute('aria-pressed', 'false');
      box.appendChild(b);
      if (opts.length === 1 && i === 0) b.click();
    });
  }

  // ── Lawn package × size
  var pkgSel = document.getElementById('lawnPkg'), sizeSel = document.getElementById('lawnSize');
  var lawnBtn = document.getElementById('addLawn'), lawnPick = null;
  book.LAWN_PACKAGES.forEach(function (p) { pkgSel.add(new Option(p.name, p.key)); });
  book.LAWN_SIZES.forEach(function (s) { sizeSel.add(new Option(s.label + ' · ' + s.range, s.key)); });
  function lawnSel() {
    var p = book.LAWN_PACKAGES.find(function (x) { return x.key === pkgSel.value; });
    var s = book.LAWN_SIZES.find(function (x) { return x.key === sizeSel.value; });
    return { p: p, s: s, r: p.prices[s.key] };
  }
  function setLawnBtn() {
    lawnBtn.disabled = lawnPick == null;
    lawnBtn.textContent = lawnPick == null ? 'Choose a price first' : 'Add to quote · ' + fmt(lawnPick);
  }
  function showLawn() {
    var l = lawnSel(); lawnPick = null;
    document.getElementById('lawnIncludes').textContent = 'Includes: ' + l.p.includes.join(', ');
    var opts = l.r[0] === l.r[1] ? [{ price: fmt(l.r[0]), note: 'Set price', value: l.r[0] }]
      : [{ price: fmt(l.r[0]), note: 'Low end · easy, open yard', value: l.r[0] }, { price: fmt(l.r[1]), note: 'High end · more trimming & detail', value: l.r[1] }];
    choices(document.getElementById('lawnChoices'), opts, function (v) { lawnPick = v; setLawnBtn(); });
    setLawnBtn();
  }
  pkgSel.onchange = sizeSel.onchange = showLawn; showLawn();
  lawnBtn.onclick = function () {
    if (lawnPick == null) return;
    var l = lawnSel();
    add(l.p.name, l.s.label + ' lawn (' + l.s.range + ') · ' + l.p.includes.join(', '), lawnPick);
    showLawn();
  };

  // ── Lawn conditions: each has a low / high charge to pick from
  var adjBox = document.getElementById('adjList');
  book.LAWN_ADJUSTMENTS.forEach(function (a) {
    var row = document.createElement('div'); row.className = 'cond';
    row.innerHTML = '<div class="cond-name">' + esc(a.name) + '</div><div class="choices sm"></div><button type="button" class="btn small" disabled>Add</button>';
    var btn = row.querySelector('button'), pick = null;
    var levels = a.levels || [a.low, a.high];
    choices(row.querySelector('.choices'), levels.map(function (v, i) {
      return { price: fmt(v) + (a.plus && i === levels.length - 1 ? '+' : ''), note: a.levelNotes ? a.levelNotes[i] : '', value: v };
    }),
      function (v) { pick = v; btn.disabled = false; });
    btn.onclick = function () {
      add(a.name, 'Lawn condition adjustment', pick);
      pick = null; btn.disabled = true;
      row.querySelectorAll('.choice').forEach(function (c) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
    };
    adjBox.appendChild(row);
  });

  function list(el, arr, labelFn, amountFn, detailFn, isPaint) {
    var box = document.getElementById(el);
    arr.forEach(function (x) {
      var amt = amountFn(x);
      var d = document.createElement('div'); d.className = 'opt';
      d.innerHTML = '<span>' + esc(labelFn(x)) + '</span>';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn small ghost';
      b.textContent = amt == null ? 'Add' : 'Add · ' + fmt(amt);
      b.onclick = function () { add(x.name, detailFn ? detailFn(x) : '', amt == null ? 0 : amt, isPaint); };
      d.appendChild(b); box.appendChild(d);
    });
  }
  list('addonList', book.OUTDOOR_ADDONS, function (a) { return a.name; }, function (a) { return a.from; });
  list('paintList', book.PAINT_PACKAGES, function (p) { return p.name + ' · ' + p.price; }, function (p) { return p.from; }, function (p) { return p.includes.join(', '); }, true);
  list('paintAddonList', book.PAINT_ADDONS, function (a) { return a.name + (a.unit ? ' (' + a.unit + ')' : ''); }, function (a) { return a.from; }, function (a) { return a.desc; }, true);

  // new-customer fields only when no existing client is selected
  var clientSel = document.getElementById('clientSel'), nc = document.getElementById('newClient');
  function toggleClient() { nc.style.display = clientSel.value ? 'none' : ''; }
  clientSel.onchange = toggleClient; toggleClient();

  document.getElementById('qform').addEventListener('submit', function (e) {
    var clean = items.filter(function (it) { return String(it.label).trim(); });
    if (!clientSel.value && !document.querySelector('[name=new_name]').value.trim()) {
      e.preventDefault(); alert('Pick a customer or enter a new customer name.'); return;
    }
    document.getElementById('itemsField').value = JSON.stringify(clean);
  });
  render();
})();
