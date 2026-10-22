(function () {
  var book = JSON.parse(document.getElementById('pricebook').textContent);
  var items = JSON.parse(document.getElementById('initialItems').textContent) || [];
  var rows = document.getElementById('itemRows');
  var fmt = function (n) { n = Number(n || 0); return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  var round = function (n) { return Math.round(n * 100) / 100; };
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

  // Total, plus a warning (and a one-click fix) when the quote is under the minimum job charge
  var minWarn = document.getElementById('minWarn'), minimum = book.MINIMUM_JOB && book.MINIMUM_JOB.amount;
  function total() {
    var t = items.reduce(function (s, it) { return s + (Number(it.amount) || 0); }, 0);
    document.getElementById('total').textContent = fmt(t);
    var short = minimum && t > 0 && t < minimum;
    minWarn.hidden = !short;
    if (short) minWarn.innerHTML = 'This quote is under your ' + fmt(minimum) + ' minimum job. <button type="button" class="link" id="addMin">Add a ' + fmt(round(minimum - t)) + ' minimum-job charge</button>';
  }
  minWarn.addEventListener('click', function (e) {
    if (e.target.id !== 'addMin') return;
    var t = items.reduce(function (s, it) { return s + (Number(it.amount) || 0); }, 0);
    add('Minimum job charge', 'Brings the total up to the ' + fmt(minimum) + ' minimum', round(minimum - t));
  });

  function add(label, detail, amount) {
    items.push({ label: label, detail: detail || '', amount: amount });
    render();
    rows.lastChild.classList.add('added'); // brief highlight so you can see it landed
  }
  rows.addEventListener('input', function (e) {
    var i = e.target.dataset.i, k = e.target.dataset.k; if (i == null) return;
    items[i][k] = e.target.value; total();
  });
  rows.addEventListener('click', function (e) {
    if (e.target.dataset.del != null) { items.splice(Number(e.target.dataset.del), 1); render(); }
  });
  document.getElementById('addBlank').addEventListener('click', function () { add('', '', 0); rows.querySelector('tr:last-child input').focus(); });

  // ── Concrete: project type × (length × width) × rate per sq ft
  var typeSel = document.getElementById('cType'), len = document.getElementById('cLen'), wid = document.getElementById('cWid');
  var calc = document.getElementById('cCalc'), addBtn = document.getElementById('addConcrete'), xArea = document.getElementById('xArea');
  book.CONCRETE_RATES.forEach(function (r) { typeSel.add(new Option(r.name + (r.rate != null ? ' · ' + fmt(r.rate) + '/sq ft' : ''), r.key)); });
  var wanted = document.getElementById('book').dataset.type; // the project type the customer asked for
  var match = book.CONCRETE_RATES.find(function (r) { return r.name === wanted; });
  if (match) typeSel.value = match.key;

  function concrete() {
    var r = book.CONCRETE_RATES.find(function (x) { return x.key === typeSel.value; });
    var l = Number(len.value), w = Number(wid.value), area = l > 0 && w > 0 ? round(l * w) : 0;
    return { r: r, l: l, w: w, area: area, amount: area && r.rate != null ? round(area * r.rate) : null };
  }
  function showConcrete() {
    var c = concrete();
    if (!c.area) { calc.textContent = 'Enter the length and width.'; addBtn.disabled = true; addBtn.textContent = 'Enter length and width'; return; }
    calc.textContent = c.l + ' × ' + c.w + ' ft = ' + c.area.toLocaleString('en-US') + ' sq ft' + (c.r.rate != null ? ' × ' + fmt(c.r.rate) + ' = ' + fmt(c.amount) : ' · no rate set, enter the amount after adding');
    addBtn.disabled = false;
    addBtn.textContent = 'Add to quote' + (c.amount != null ? ' · ' + fmt(c.amount) : '');
    xArea.value = c.area;
  }
  typeSel.onchange = len.oninput = wid.oninput = showConcrete;
  addBtn.onclick = function () {
    var c = concrete(); if (!c.area) return;
    add(c.r.name, c.l + ' × ' + c.w + ' ft (' + c.area.toLocaleString('en-US') + ' sq ft)' + (c.r.rate != null ? ' × ' + fmt(c.r.rate) + '/sq ft' : ''), c.amount != null ? c.amount : 0);
  };

  // ── Extras: per sq ft over the area above (or one typed in)
  var box = document.getElementById('extraList');
  book.CONCRETE_EXTRAS.forEach(function (x) {
    var d = document.createElement('div'); d.className = 'opt';
    d.innerHTML = '<span>' + esc(x.name) + (x.rate != null ? ' · ' + fmt(x.rate) + '/sq ft' : '') + '</span>';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn small ghost'; b.textContent = 'Add';
    b.onclick = function () {
      var a = Number(xArea.value) || 0;
      var amt = a && x.rate != null ? round(a * x.rate) : 0;
      add(x.name, (a ? a.toLocaleString('en-US') + ' sq ft' + (x.rate != null ? ' × ' + fmt(x.rate) + '/sq ft' : '') : x.desc), amt);
    };
    d.appendChild(b); box.appendChild(d);
  });

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
