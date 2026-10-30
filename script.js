(function () {
  "use strict";

  var KEY = "split-bill:v1";
  var CUR = {
    IDR: {d: 0, l: "id-ID"}, USD: {d: 2, l: "en-US"}, EUR: {d: 2, l: "en-US"},
    GBP: {d: 2, l: "en-GB"}, SGD: {d: 2, l: "en-SG"}, MYR: {d: 2, l: "en-MY"},
    THB: {d: 2, l: "en-US"}, PHP: {d: 2, l: "en-PH"}, VND: {d: 0, l: "vi-VN"},
    JPY: {d: 0, l: "ja-JP"}, AUD: {d: 2, l: "en-AU"}
  };

  var counter = 0;
  function newId() {
    counter += 1;
    return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + counter;
  }

  function fresh() {
    return {currency: "IDR", people: [], items: [], service: "", tax: "", taxOnService: true,
            discount: "", roundTo: "", payer: ""};
  }
  var state = fresh();
  var last = null;

  /* ---------- storage ---------- */

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object") return;
      var f = fresh();
      if (CUR[s.currency]) f.currency = s.currency;
      if (Array.isArray(s.people)) {
        f.people = s.people.filter(function (p) {
          return p && typeof p.id === "string" && typeof p.name === "string";
        }).slice(0, 30).map(function (p) { return {id: p.id, name: p.name.slice(0, 40)}; });
      }
      if (Array.isArray(s.items)) {
        f.items = s.items.filter(function (it) { return it && typeof it.id === "string"; })
          .slice(0, 200).map(function (it) {
            return {
              id: it.id,
              name: String(it.name || "").slice(0, 60),
              price: String(it.price || "").slice(0, 20),
              all: !!it.all,
              shared: Array.isArray(it.shared)
                ? it.shared.filter(function (x) { return typeof x === "string"; }) : []
            };
          });
      }
      f.service = String(s.service || "").slice(0, 10);
      f.tax = String(s.tax || "").slice(0, 10);
      f.discount = String(s.discount || "").slice(0, 20);
      f.roundTo = String(s.roundTo || "").slice(0, 20);
      f.taxOnService = s.taxOnService !== false;
      f.payer = typeof s.payer === "string" ? s.payer : "";
      state = f;
    } catch (e) { /* ignore broken saved data */ }
  }

  /* ---------- helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  var fmtCache = {};
  function money(minor) {
    var key = state.currency, c = CUR[key];
    if (!fmtCache[key]) {
      fmtCache[key] = new Intl.NumberFormat(c.l, {
        style: "currency", currency: key,
        minimumFractionDigits: c.d, maximumFractionDigits: c.d
      });
    }
    return fmtCache[key].format(minor / Math.pow(10, c.d));
  }

  function toMinor(str) {
    var d = CUR[state.currency].d, s = String(str || "").trim(), n;
    if (!s) return 0;
    if (d === 0) {
      n = parseInt(s.replace(/[^\d]/g, ""), 10);
      return isFinite(n) ? n : 0;
    }
    n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
    return isFinite(n) && n > 0 ? Math.round(n * Math.pow(10, d)) : 0;
  }

  function pct(s) {
    var n = parseFloat(String(s || "").replace(",", "."));
    return isFinite(n) && n > 0 ? Math.min(n, 100) : 0;
  }

  // Split an integer total in proportion to weights. Parts always add up to total.
  function allocate(total, weights) {
    var n = weights.length, out = [], i;
    for (i = 0; i < n; i++) out.push(0);
    if (!n || total <= 0) return out;
    var sum = 0;
    for (i = 0; i < n; i++) sum += weights[i];
    if (sum <= 0) { weights = weights.map(function () { return 1; }); sum = n; }
    var used = 0, rem = [];
    for (i = 0; i < n; i++) {
      var exact = total * weights[i] / sum;
      out[i] = Math.floor(exact);
      used += out[i];
      rem.push([i, exact - out[i]]);
    }
    rem.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    for (var k = 0; k < total - used; k++) out[rem[k][0]] += 1;
    return out;
  }

  function sum(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); }

  function itemIds(item) {
    if (item.all) return state.people.map(function (p) { return p.id; });
    var ok = {};
    state.people.forEach(function (p) { ok[p.id] = true; });
    return item.shared.filter(function (id) { return ok[id]; });
  }

  /* ---------- calculation ---------- */

  function compute() {
    var P = state.people, n = P.length, idx = {}, i;
    P.forEach(function (p, k) { idx[p.id] = k; });

    var sub = [], names = [];
    for (i = 0; i < n; i++) { sub.push(0); names.push([]); }
    var unassigned = 0, anyPriced = false;

    state.items.forEach(function (item) {
      var price = toMinor(item.price);
      if (!price) return;
      anyPriced = true;
      var ids = itemIds(item);
      if (!ids.length) { unassigned += price; return; }
      var parts = allocate(price, ids.map(function () { return 1; }));
      ids.forEach(function (id, k) {
        sub[idx[id]] += parts[k];
        names[idx[id]].push(item.name || "Item");
      });
    });

    var subTotal = sum(sub);
    var discount = Math.min(toMinor(state.discount), subTotal);
    var dsc = allocate(discount, sub);
    var net = sub.map(function (v, k) { return v - dsc[k]; });
    var netTotal = sum(net);

    var service = Math.round(netTotal * pct(state.service) / 100);
    var svc = allocate(service, net);

    var base = net.map(function (v, k) { return v + (state.taxOnService ? svc[k] : 0); });
    var taxTotal = Math.round(sum(base) * pct(state.tax) / 100);
    var tax = allocate(taxTotal, base);

    var step = toMinor(state.roundTo);
    var rows = P.map(function (p, k) {
      var total = net[k] + svc[k] + tax[k];
      var pay = step > 1 ? Math.ceil(total / step) * step : total;
      return {id: p.id, name: p.name, sub: sub[k], discount: dsc[k], service: svc[k],
              tax: tax[k], total: total, pay: pay, items: names[k]};
    });

    var grand = netTotal + service + taxTotal;
    return {rows: rows, subTotal: subTotal, discount: discount, service: service, taxTotal: taxTotal,
            grand: grand, unassigned: unassigned, anyPriced: anyPriced,
            collected: sum(rows.map(function (r) { return r.pay; }))};
  }

  /* ---------- render: people ---------- */

  function renderPeople() {
    var box = $("people");
    box.textContent = "";
    state.people.forEach(function (p) {
      var chip = el("span", "person");
      chip.appendChild(el("span", "", p.name));
      var x = el("button", "", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Remove " + p.name);
      x.addEventListener("click", function () { removePerson(p.id); });
      chip.appendChild(x);
      box.appendChild(chip);
    });
    renderPayer();
  }

  function renderPayer() {
    var sel = $("payer");
    sel.textContent = "";
    var none = el("option", "", "Not set");
    none.value = "";
    sel.appendChild(none);
    state.people.forEach(function (p) {
      var o = el("option", "", p.name);
      o.value = p.id;
      sel.appendChild(o);
    });
    sel.value = state.payer;
    if (sel.value !== state.payer) { state.payer = ""; sel.value = ""; }
  }

  function addPerson() {
    var input = $("pname");
    var name = input.value.trim();
    if (!name || state.people.length >= 30) return;
    state.people.push({id: newId(), name: name.slice(0, 40)});
    input.value = "";
    input.focus();
    renderPeople();
    renderItems();
    update();
  }

  function removePerson(id) {
    state.people = state.people.filter(function (p) { return p.id !== id; });
    state.items.forEach(function (it) {
      it.shared = it.shared.filter(function (x) { return x !== id; });
    });
    if (state.payer === id) state.payer = "";
    renderPeople();
    renderItems();
    update();
  }

  /* ---------- render: items ---------- */

  function renderItems() {
    var box = $("items");
    box.textContent = "";
    if (!state.items.length) {
      box.appendChild(el("div", "empty", "No items yet. Add one, or load the example."));
      return;
    }
    state.items.forEach(function (item) { box.appendChild(itemRow(item)); });
  }

  function itemRow(item) {
    var wrap = el("div", "item");
    var top = el("div", "top");

    var name = el("input", "name");
    name.type = "text"; name.maxLength = 60; name.placeholder = "Item name";
    name.setAttribute("aria-label", "Item name");
    name.value = item.name;
    name.addEventListener("input", function () { item.name = name.value; update(); });

    var price = el("input", "price");
    price.type = "text"; price.maxLength = 20; price.placeholder = "Price";
    price.setAttribute("inputmode", "decimal");
    price.setAttribute("aria-label", "Item price");
    price.value = item.price;
    price.addEventListener("input", function () { item.price = price.value; update(); });

    var del = el("button", "del", "Remove");
    del.type = "button";
    del.addEventListener("click", function () {
      state.items = state.items.filter(function (x) { return x.id !== item.id; });
      renderItems();
      update();
    });

    top.appendChild(name); top.appendChild(price); top.appendChild(del);
    wrap.appendChild(top);

    var who = el("div", "who");
    var everyone = el("button", "tog", "Everyone");
    everyone.type = "button";
    everyone.setAttribute("aria-pressed", String(!!item.all));
    everyone.addEventListener("click", function () {
      item.all = !item.all;
      if (!item.all) item.shared = [];
      renderItems();
      update();
    });
    who.appendChild(everyone);

    var current = itemIds(item);
    state.people.forEach(function (p) {
      var on = current.indexOf(p.id) !== -1;
      var b = el("button", "tog", p.name);
      b.type = "button";
      b.setAttribute("aria-pressed", String(on));
      b.addEventListener("click", function () {
        var ids = itemIds(item);
        var at = ids.indexOf(p.id);
        if (at === -1) ids.push(p.id); else ids.splice(at, 1);
        item.shared = ids;
        item.all = false;
        renderItems();
        update();
      });
      who.appendChild(b);
    });
    if (!state.people.length) who.appendChild(el("span", "hint", "Add people above first."));
    wrap.appendChild(who);
    return wrap;
  }

  function addItem() {
    state.items.push({id: newId(), name: "", price: "", all: true, shared: []});
    renderItems();
    update();
    var inputs = $("items").querySelectorAll(".item .name");
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  /* ---------- render: results ---------- */

  function line(label, value, cls) {
    var d = el("div", cls || "");
    d.appendChild(el("span", "", label));
    d.appendChild(el("span", "", value));
    return d;
  }

  function renderResults() {
    var r = compute();
    last = r;
    var box = $("results"), notes = $("notes");
    box.textContent = "";
    notes.textContent = "";
    $("copy").disabled = true;

    if (!state.people.length || !r.anyPriced) {
      box.appendChild(el("div", "empty", "Add people and priced items to see who pays what."));
      return;
    }
    $("copy").disabled = false;

    var totals = el("div", "totals");
    totals.appendChild(line("Items", money(r.subTotal)));
    if (r.discount) totals.appendChild(line("Discount", "−" + money(r.discount)));
    if (r.service) totals.appendChild(line("Service charge", money(r.service)));
    if (r.taxTotal) totals.appendChild(line("Tax", money(r.taxTotal)));
    totals.appendChild(line("Bill total", money(r.grand), "sum"));
    box.appendChild(totals);

    var cards = el("div", "cards");
    r.rows.forEach(function (row) {
      var c = el("div", "card");
      c.appendChild(el("div", "nm", row.name));
      c.appendChild(el("div", "amt", money(row.pay)));
      var parts = ["Items " + money(row.sub)];
      if (row.discount) parts.push("Discount −" + money(row.discount));
      if (row.service) parts.push("Service " + money(row.service));
      if (row.tax) parts.push("Tax " + money(row.tax));
      c.appendChild(el("div", "bd", parts.join(" · ")));
      if (row.items.length) c.appendChild(el("div", "its", row.items.join(", ")));
      cards.appendChild(c);
    });
    box.appendChild(cards);

    var payer = null;
    r.rows.forEach(function (row) { if (row.id === state.payer) payer = row; });
    if (payer) {
      var owe = el("div", "owe");
      r.rows.forEach(function (row) {
        if (row.id !== payer.id && row.pay > 0) {
          owe.appendChild(line(row.name + " pays " + payer.name, money(row.pay)));
        }
      });
      if (owe.childNodes.length) box.appendChild(owe);
    }

    if (r.unassigned) {
      notes.appendChild(el("div", "warn",
        money(r.unassigned) + " of items has nobody selected, so it is not included in anyone's share."));
    }
    if (r.collected !== r.grand && !r.unassigned) {
      var diff = r.collected - r.grand;
      notes.appendChild(el("div", "note",
        "Rounding makes the group pay " + money(Math.abs(diff)) + (diff > 0 ? " more" : " less") +
        " than the bill total."));
    }
  }

  function summaryText() {
    if (!last) return "";
    var r = last, lines = ["Split bill (" + state.currency + ")"];
    lines.push("Items: " + money(r.subTotal));
    if (r.discount) lines.push("Discount: -" + money(r.discount));
    if (r.service) lines.push("Service: " + money(r.service));
    if (r.taxTotal) lines.push("Tax: " + money(r.taxTotal));
    lines.push("Total: " + money(r.grand), "");
    r.rows.forEach(function (row) { lines.push(row.name + ": " + money(row.pay)); });
    r.rows.forEach(function (row) {
      if (row.id === state.payer) lines.push("", "Please pay " + row.name + ".");
    });
    return lines.join("\n");
  }

  function update() { save(); renderResults(); }

  /* ---------- settings ---------- */

  function syncSettings() {
    $("cur").value = state.currency;
    $("svc").value = state.service;
    $("tax").value = state.tax;
    $("disc").value = state.discount;
    $("round").value = state.roundTo;
    $("taxsvc").checked = state.taxOnService;
    renderPayer();
  }

  function bindSettings() {
    var sel = $("cur");
    Object.keys(CUR).forEach(function (code) {
      var o = el("option", "", code);
      o.value = code;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () { state.currency = sel.value; update(); });
    $("svc").addEventListener("input", function () { state.service = this.value; update(); });
    $("tax").addEventListener("input", function () { state.tax = this.value; update(); });
    $("disc").addEventListener("input", function () { state.discount = this.value; update(); });
    $("round").addEventListener("input", function () { state.roundTo = this.value; update(); });
    $("taxsvc").addEventListener("change", function () { state.taxOnService = this.checked; update(); });
    $("payer").addEventListener("change", function () { state.payer = this.value; update(); });
  }

  /* ---------- actions ---------- */

  function copyText(text) {
    var done = function () {
      var b = $("copy"), old = b.textContent;
      b.textContent = "Copied!";
      setTimeout(function () { b.textContent = old; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* nothing else to try */ }
    document.body.removeChild(ta);
  }

  function loadExample() {
    var a = newId(), b = newId(), c = newId();
    state = fresh();
    state.currency = "IDR";
    state.people = [{id: a, name: "Alice"}, {id: b, name: "Bob"}, {id: c, name: "Cara"}];
    state.items = [
      {id: newId(), name: "Nasi goreng", price: "35000", all: false, shared: [a]},
      {id: newId(), name: "Mie ayam", price: "28000", all: false, shared: [b]},
      {id: newId(), name: "Es teh (3)", price: "15000", all: true, shared: []},
      {id: newId(), name: "Pizza to share", price: "90000", all: true, shared: []},
      {id: newId(), name: "Dessert", price: "40000", all: false, shared: [a, c]}
    ];
    state.service = "5";
    state.tax = "10";
    state.discount = "10000";
    state.payer = a;
    syncSettings();
    renderPeople();
    renderItems();
    update();
  }

  function reset() {
    if (!window.confirm("Clear everyone and everything?")) return;
    state = fresh();
    syncSettings();
    renderPeople();
    renderItems();
    update();
  }

  /* ---------- start ---------- */

  load();
  bindSettings();
  syncSettings();
  renderPeople();
  renderItems();
  renderResults();

  $("padd").addEventListener("click", addPerson);
  $("pname").addEventListener("keydown", function (e) { if (e.key === "Enter") addPerson(); });
  $("iadd").addEventListener("click", addItem);
  $("example").addEventListener("click", loadExample);
  $("copy").addEventListener("click", function () { copyText(summaryText()); });
  $("reset").addEventListener("click", reset);
})();
