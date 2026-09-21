/* Neoma — shared helpers. Classic script, no build step. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = {};

  /* ---------- ids & numbers ---------- */
  U.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  U.clamp = function (n, min, max) { return Math.min(max, Math.max(min, n)); };
  U.pct = function (part, total) { return total ? Math.round((part / total) * 100) : 0; };
  U.sum = function (arr, fn) { return arr.reduce(function (a, b) { return a + fn(b); }, 0); };
  U.uniq = function (arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); };
  U.byId = function (arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  };
  U.sortBy = function (arr, fn, dir) {
    var d = dir === 'desc' ? -1 : 1;
    return arr.slice().sort(function (a, b) {
      var x = fn(a), y = fn(b);
      if (x == null) return 1;
      if (y == null) return -1;
      if (x < y) return -1 * d;
      if (x > y) return 1 * d;
      return 0;
    });
  };
  U.groupBy = function (arr, fn) {
    return arr.reduce(function (acc, item) {
      var k = fn(item);
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  };

  /* ---------- strings ---------- */
  U.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  U.attr = U.escapeHtml;
  U.truncate = function (s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  };
  U.plain = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  U.slug = function (s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };
  U.initials = function (name) {
    var parts = U.plain(name).split(' ').filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  U.domainOf = function (url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return String(url || '').replace(/^https?:\/\//, '').split('/')[0]; }
  };
  U.multiline = function (s) {
    return U.escapeHtml(s).replace(/\n/g, '<br>');
  };
  U.match = function (haystack, needle) {
    return String(haystack || '').toLowerCase().indexOf(String(needle || '').toLowerCase()) !== -1;
  };

  /* ---------- timing ---------- */
  U.debounce = function (fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait || 200);
    };
  };
  U.throttle = function (fn, wait) {
    var last = 0, timer;
    return function () {
      var args = arguments, self = this, now = Date.now();
      var remaining = wait - (now - last);
      if (remaining <= 0) { last = now; fn.apply(self, args); }
      else if (!timer) { timer = setTimeout(function () { last = Date.now(); timer = null; fn.apply(self, args); }, remaining); }
    };
  };
  U.MS = { min: 60000, hour: 3600000, day: 86400000 };

  /* ---------- dates ---------- */
  U.startOfDay = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  U.endOfDay = function (d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  U.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  U.addMinutes = function (d, n) { var x = new Date(d); x.setMinutes(x.getMinutes() + n); return x; };
  U.isSameDay = function (a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };
  U.dayKey = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  U.daysUntil = function (target, from) {
    var a = U.startOfDay(target), b = U.startOfDay(from || new Date());
    return Math.round((a - b) / U.MS.day);
  };
  U.hoursUntil = function (target, from) {
    return Math.round((new Date(target) - (from || new Date())) / U.MS.hour);
  };
  U.fmtTime = function (d) {
    return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  U.fmtDay = function (d) {
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  U.fmtDayLong = function (d) {
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  U.fmtMonthYear = function (d) {
    return new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };
  U.fmtDateTime = function (d) { return U.fmtDay(d) + ' · ' + U.fmtTime(d); };
  U.fmtRelative = function (d, from) {
    var diff = new Date(d) - (from || new Date());
    var abs = Math.abs(diff);
    var past = diff < 0;
    if (abs < U.MS.min) return 'just now';
    var mins = Math.round(abs / U.MS.min);
    if (mins < 60) return past ? mins + 'm ago' : 'in ' + mins + 'm';
    var hours = Math.round(abs / U.MS.hour);
    if (hours < 24) return past ? hours + 'h ago' : 'in ' + hours + 'h';
    var days = Math.round(abs / U.MS.day);
    if (days === 1) return past ? 'yesterday' : 'tomorrow';
    if (days < 30) return past ? days + 'd ago' : 'in ' + days + 'd';
    return U.fmtDay(d);
  };
  U.toInputValue = function (d) {
    var x = d ? new Date(d) : new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()) + 'T' + pad(x.getHours()) + ':' + pad(x.getMinutes());
  };
  U.fromInputValue = function (s) {
    if (!s) return null;
    var parts = String(s).split('T');
    var dmy = parts[0].split('-').map(Number);
    var hm = (parts[1] || '00:00').split(':').map(Number);
    return new Date(dmy[0], dmy[1] - 1, dmy[2], hm[0], hm[1], 0, 0);
  };
  U.dayLabel = function (d, from) {
    var n = U.daysUntil(d, from);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return U.fmtDay(d);
  };
  /* Monday-first month grid: 6 rows x 7 cols */
  U.monthGrid = function (anchor) {
    var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    var offset = (first.getDay() + 6) % 7;
    var start = U.addDays(first, -offset);
    var cells = [];
    for (var i = 0; i < 42; i++) cells.push(U.addDays(start, i));
    return cells;
  };
  /* Monday-first week */
  U.weekDays = function (anchor) {
    var offset = (anchor.getDay() + 6) % 7;
    var monday = U.addDays(U.startOfDay(anchor), -offset);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(U.addDays(monday, i));
    return days;
  };
  U.WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /* ---------- deadline moon phases ----------
     Illuminated fraction grows as the deadline approaches.
     overdue -> full disc (danger), done -> full disc (mint + check). */
  U.moonPhase = function (dueAt, done, from) {
    var now = from || new Date();
    var due = new Date(dueAt);
    if (done) return { f: 1, tone: 'done', label: 'done', days: U.daysUntil(due, now) };
    var hours = (due - now) / U.MS.hour;
    if (hours < 0) {
      var od = Math.max(1, Math.ceil(-hours / 24));
      return { f: 1, tone: 'danger', label: 'overdue ' + od + 'd', days: -od };
    }
    var days = U.daysUntil(due, now);
    var f, tone;
    if (hours <= 24) { f = 0.92; tone = 'today'; }
    else if (days <= 3) { f = 0.75; tone = 'soon'; }
    else if (days <= 7) { f = 0.55; tone = 'muted'; }
    else if (days <= 14) { f = 0.35; tone = 'muted'; }
    else { f = 0.18; tone = 'muted'; }
    var label = hours <= 24 ? 'today' : 'in ' + days + 'd';
    return { f: f, tone: tone, label: label, days: days, hours: hours };
  };
  U.moonPath = function (cx, cy, r, f) {
    if (f <= 0.02) return '';
    if (f >= 0.98) {
      return 'M ' + cx + ' ' + (cy - r) + ' a ' + r + ' ' + r + ' 0 1 0 0.01 0 Z';
    }
    var rx = Math.abs(2 * f - 1) * r;
    var sweepInner = f < 0.5 ? 0 : 1;
    return 'M ' + cx + ' ' + (cy - r) +
      ' A ' + r + ' ' + r + ' 0 0 1 ' + cx + ' ' + (cy + r) +
      ' A ' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + sweepInner + ' ' + cx + ' ' + (cy - r) + ' Z';
  };
  U.moonSvg = function (f, tone, size, extraClass) {
    var s = size || 22;
    var r = s / 2 - 1.5;
    var c = s / 2;
    var path = U.moonPath(c, c, r, f);
    var check = tone === 'done'
      ? '<path d="M ' + (c - r * 0.45) + ' ' + c + ' l ' + (r * 0.32) + ' ' + (r * 0.34) + ' l ' + (r * 0.62) + ' ' + (-r * 0.7) + '" fill="none" stroke="var(--dial-check)" stroke-width="' + (s / 9).toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"/>'
      : '';
    return '<svg class="nm-dial nm-dial--' + tone + (extraClass ? ' ' + extraClass : '') + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 ' + s + ' ' + s + '" aria-hidden="true" focusable="false">' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>' +
      (path ? '<path d="' + path + '" fill="currentColor"/>' : '') + check + '</svg>';
  };
  U.dial = function (dueAt, done, opts) {
    opts = opts || {};
    var p = U.moonPhase(dueAt, done, opts.now);
    var text = opts.showLabel === false ? '' : '<span class="nm-dial-label">' + U.escapeHtml(p.label) + '</span>';
    var title = p.tone === 'done' ? 'Done' : (p.tone === 'danger' ? 'Overdue' : 'Due ' + U.fmtDateTime(dueAt));
    return '<span class="nm-dial-wrap nm-dial-wrap--' + p.tone + '" title="' + U.attr(title) + '" role="img" aria-label="' + U.attr(title) + '">' +
      U.moonSvg(p.f, p.tone, opts.size || 22) + text + '</span>';
  };

  /* ---------- colors (highlighter markers) ---------- */
  U.MARKERS = [
    { key: 'amber', hex: '#E0B93F', label: 'Amber' },
    { key: 'mint', hex: '#4FBF9F', label: 'Mint' },
    { key: 'sky', hex: '#5C9AE0', label: 'Sky' },
    { key: 'coral', hex: '#E8674C', label: 'Coral' },
    { key: 'violet', hex: '#8A76D9', label: 'Violet' },
    { key: 'pink', hex: '#DB7BAE', label: 'Pink' }
  ];
  U.marker = function (key) {
    for (var i = 0; i < U.MARKERS.length; i++) if (U.MARKERS[i].key === key) return U.MARKERS[i];
    return U.MARKERS[0];
  };
  U.hashInt = function (str) {
    var h = 0, s = String(str || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };
  U.avatarColor = function (seed) {
    return U.MARKERS[U.hashInt(seed) % U.MARKERS.length].hex;
  };

  /* ---------- tiny event bus ---------- */
  U.bus = (function () {
    var map = {};
    return {
      on: function (evt, fn) { (map[evt] = map[evt] || []).push(fn); return function () { U.bus.off(evt, fn); }; },
      off: function (evt, fn) { map[evt] = (map[evt] || []).filter(function (f) { return f !== fn; }); },
      emit: function (evt, payload) { (map[evt] || []).slice().forEach(function (fn) { try { fn(payload); } catch (e) { console.error(e); } }); }
    };
  })();

  /* ---------- storage ---------- */
  U.storage = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { console.warn('Neoma: could not persist', key, e); return false; }
    },
    remove: function (key) { try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  /* ---------- dom ---------- */
  U.qs = function (sel, root) { return (root || document).querySelector(sel); };
  U.qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.node = function (html) {
    var t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  };
  /* Delegation with a ledger: pages delegate on #view on every render, and the
     router releases those listeners before the next one, so a single click never
     fires a pile of handlers left over from earlier renders. */
  var delegated = [];
  U.delegate = function (root, selector, type, handler) {
    var fn = function (e) {
      var target = e.target.closest(selector);
      if (target && root.contains(target)) handler(e, target);
    };
    root.addEventListener(type, fn);
    delegated.push({ root: root, type: type, fn: fn });
    return fn;
  };
  U.releaseDelegates = function (root) {
    delegated = delegated.filter(function (d) {
      var keep = d.root !== root && d.root.isConnected;
      if (!keep) d.root.removeEventListener(d.type, d.fn);
      return keep;
    });
  };
  U.focusable = function (root) {
    return U.qsa('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
      .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  };
  U.download = function (filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };
  U.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return U.copyFallback(text); });
    }
    return Promise.resolve(U.copyFallback(text));
  };
  U.copyFallback = function (text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  };

  N.util = U;
})();
