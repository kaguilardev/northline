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
  }
  rows.addEventListener('input', function (e) {
    var i = e.target.dataset.i, k = e.target.dataset.k; if (i == null) return;
    items[i][k] = k === 'amount' ? e.target.value : e.target.value; total();
  });
  rows.addEventListener('click', function (e) {
    if (e.target.dataset.del != null) { items.splice(Number(e.target.dataset.del), 1); render(); }
  });
  document.getElementById('addBlank').addEventListener('click', function () { add('', '', 0); rows.querySelector('tr:last-child input').focus(); });

  // lawn package × size
  var pkgSel = document.getElementById('lawnPkg'), sizeSel = document.getElementById('lawnSize'), rangeEl = document.getElementById('lawnRange');
  book.LAWN_PACKAGES.forEach(function (p) { pkgSel.add(new Option(p.name, p.key)); });
  book.LAWN_SIZES.forEach(function (s) { sizeSel.add(new Option(s.label + ' · ' + s.range, s.key)); });
  function lawnSel() {
    var p = book.LAWN_PACKAGES.find(function (x) { return x.key === pkgSel.value; });
    var s = book.LAWN_SIZES.find(function (x) { return x.key === sizeSel.value; });
    return { p: p, s: s, r: p.prices[s.key] };
  }
  function showRange() { var l = lawnSel(); rangeEl.textContent = l.r[0] === l.r[1] ? fmt(l.r[0]) : fmt(l.r[0]) + '–' + fmt(l.r[1]); }
  pkgSel.onchange = sizeSel.onchange = showRange; showRange();
  document.querySelectorAll('[data-lawn]').forEach(function (b) {
    b.onclick = function () {
      var l = lawnSel();
      add(l.p.name, l.s.label + ' lawn (' + l.s.range + ') · ' + l.p.includes.join(', '), b.dataset.lawn === 'lo' ? l.r[0] : l.r[1]);
    };
  });

  function list(el, arr, labelFn, amountFn, detailFn, isPaint) {
    var box = document.getElementById(el);
    arr.forEach(function (x) {
      var amt = amountFn(x);
      var d = document.createElement('div'); d.className = 'opt';
      d.innerHTML = '<span>' + esc(labelFn(x)) + '</span>';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn small ghost';
      b.textContent = amt == null ? 'Add' : '+ ' + fmt(amt);
      b.onclick = function () { add(x.name, detailFn ? detailFn(x) : '', amt == null ? 0 : amt, isPaint); };
      d.appendChild(b); box.appendChild(d);
    });
  }
  list('adjList', book.LAWN_ADJUSTMENTS, function (a) { return a.name + ' (' + fmt(a.low) + '–' + fmt(a.high) + (a.plus ? '+' : '') + ')'; }, function (a) { return a.low; }, function () { return 'Condition adjustment'; });
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
