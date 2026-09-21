/* Neoma — local file storage (IndexedDB) + preview generation. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util;

  var DB_NAME = 'neoma-files';
  var STORE = 'files';
  var MAX_FILE_BYTES = 15 * 1024 * 1024;

  var dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB is not available in this browser.'));
      var req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var files = {
    maxBytes: MAX_FILE_BYTES,
    available: !!window.indexedDB,

    put: function (id, blob, meta) {
      return tx('readwrite', function (store) {
        return store.put(Object.assign({ id: id, blob: blob }, meta || {}));
      });
    },
    get: function (id) {
      return tx('readonly', function (store) { return store.get(id); });
    },
    remove: function (id) {
      return tx('readwrite', function (store) { return store.delete(id); });
    },
    usage: function () {
      if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
      return Promise.resolve({ usage: 0, quota: 0 });
    }
  };

  /* ---------- object URL cache (revoked when a page unmounts) ---------- */
  var urls = {};
  files.urlFor = function (id) {
    if (urls[id]) return Promise.resolve(urls[id]);
    return files.get(id).then(function (rec) {
      if (!rec || !rec.blob) return null;
      var url = URL.createObjectURL(rec.blob);
      urls[id] = url;
      return url;
    }).catch(function () { return null; });
  };
  files.thumbUrlFor = function (id) {
    var key = id + ':thumb';
    if (urls[key]) return Promise.resolve(urls[key]);
    return files.get(key).then(function (rec) {
      if (!rec || !rec.blob) return files.urlFor(id);
      var url = URL.createObjectURL(rec.blob);
      urls[key] = url;
      return url;
    }).catch(function () { return null; });
  };
  files.releaseUrls = function () {
    Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); delete urls[k]; });
  };

  /* ---------- image compression ---------- */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }
  function drawToBlob(img, maxDim, quality, mime) {
    var scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve({ blob: blob, width: w, height: h }); }, mime || 'image/jpeg', quality);
    });
  }
  files.compressImage = function (file, maxDim, quality) {
    return loadImage(file).then(function (img) {
      return Promise.all([
        drawToBlob(img, maxDim || 1600, quality || 0.82),
        drawToBlob(img, 520, 0.68)
      ]).then(function (res) {
        return { full: res[0].blob, thumb: res[1].blob, width: res[0].width, height: res[0].height, thumbWidth: res[1].width, thumbHeight: res[1].height };
      });
    });
  };

  /* ---------- generated demo previews ----------
     Seeded demo items (handwritten notes, slide decks, past papers) get a
     canvas-drawn stand-in so the vault looks real without shipping binaries. */
  var previewCache = {};
  function rng(seed) {
    var s = U.hashInt(seed) || 1;
    return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  }
  function canvasUrl(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c.toDataURL('image/jpeg', 0.86);
  }

  var generators = {
    hand: function (seed) {
      return canvasUrl(760, 1020, function (ctx, w, h) {
        var r = rng(seed);
        ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(90,120,150,0.22)'; ctx.lineWidth = 1;
        for (var y = 120; y < h - 40; y += 34) {
          ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(w - 50, y); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(210,90,80,0.45)';
        ctx.beginPath(); ctx.moveTo(96, 0); ctx.lineTo(96, h); ctx.stroke();
        ctx.fillStyle = '#1c2530';
        ctx.font = '600 26px Georgia, serif';
        ctx.fillText(['Redox & Titration', 'Alkene Mechanisms', 'Recursion Drills', 'Market Frameworks'][U.hashInt(seed) % 4], 116, 74);
        ctx.font = '15px Georgia, serif';
        ctx.fillStyle = 'rgba(28,37,48,0.55)';
        ctx.fillText('Week ' + (3 + (U.hashInt(seed) % 8)) + ' — lecture capture', 116, 98);
        /* wavy "handwriting" lines */
        for (var line = 0; line < 18; line++) {
          var baseY = 150 + line * 34;
          var x = 116;
          var indent = r() < 0.18 ? 24 : 0;
          x += indent;
          var dark = 0.35 + r() * 0.4;
          ctx.strokeStyle = 'rgba(30,44,66,' + dark.toFixed(2) + ')';
          ctx.lineWidth = 1.5 + r() * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, baseY);
          var target = w - 70 - r() * 90;
          while (x < target) {
            var step = 6 + r() * 14;
            x += step;
            ctx.lineTo(x, baseY + (r() - 0.5) * 7);
          }
          ctx.stroke();
          if (r() < 0.22) {
            /* highlighter swipe */
            ctx.fillStyle = 'rgba(224,185,63,0.35)';
            ctx.fillRect(116, baseY - 9, (target - 116) * (0.4 + r() * 0.5), 15);
          }
        }
        /* circled result */
        ctx.strokeStyle = 'rgba(200,69,47,0.7)'; ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(w * 0.55, h - 150, 96, 30, -0.04, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(200,69,47,0.85)';
        ctx.font = 'italic 17px Georgia, serif';
        ctx.fillText('must redo errors', w * 0.42, h - 108);
      });
    },
    slide: function (seed) {
      return canvasUrl(960, 540, function (ctx, w, h) {
        var r = rng(seed);
        var marker = U.MARKERS[U.hashInt(seed) % U.MARKERS.length].hex;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = marker; ctx.globalAlpha = 0.16; ctx.fillRect(0, 0, w, 96); ctx.globalAlpha = 1;
        ctx.fillStyle = marker; ctx.fillRect(0, 96, w, 3);
        ctx.fillStyle = '#171c1a';
        ctx.font = '600 34px Helvetica, Arial, sans-serif';
        ctx.fillText(['Market Entry: Shortlist', 'Recursion & Call Stacks', 'Spectrometry Results', 'Redox in Context'][U.hashInt(seed) % 4], 56, 62);
        ctx.font = '16px Helvetica, Arial, sans-serif';
        ctx.fillStyle = 'rgba(23,28,26,0.5)';
        ctx.fillText('Slide ' + (4 + U.hashInt(seed) % 12) + ' of 24', w - 170, 62);
        var y = 190;
        for (var i = 0; i < 5; i++) {
          ctx.fillStyle = marker;
          ctx.beginPath(); ctx.arc(70, y - 6, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(23,28,26,0.82)';
          ctx.font = (i === 0 ? '600 ' : '') + '21px Helvetica, Arial, sans-serif';
          ctx.fillText('Key point ' + (i + 1) + ': ' + ['define the segment', 'size the opportunity', 'score the fit', 'flag the risks', 'next steps'][i], 92, y);
          y += 52 + (r() < 0.3 ? 12 : 0);
        }
        ctx.fillStyle = 'rgba(23,28,26,0.35)';
        ctx.font = '14px Helvetica, Arial, sans-serif';
        ctx.fillText('BUS220 — Group 4', 56, h - 40);
        ctx.fillStyle = marker; ctx.fillRect(w - 300, h - 52, 244, 8);
      });
    },
    paper: function (seed) {
      return canvasUrl(760, 1010, function (ctx, w, h) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(23,28,26,0.12)'; ctx.lineWidth = 1;
        ctx.strokeRect(36, 36, w - 72, h - 72);
        ctx.fillStyle = '#171c1a';
        ctx.font = '600 24px Georgia, serif';
        ctx.fillText('CHEM210 — Midterm paper', 60, 86);
        ctx.font = '15px Georgia, serif';
        ctx.fillStyle = 'rgba(23,28,26,0.55)';
        ctx.fillText('2024 · Section A (40 marks) · time allowed 2h', 60, 114);
        ctx.fillStyle = '#c8452f';
        ctx.font = '700 18px Georgia, serif';
        ctx.fillText('TOTAL ___ / 100', w - 240, 88);
        var r = rng(seed);
        var y = 168;
        for (var i = 1; i <= 7; i++) {
          ctx.fillStyle = '#171c1a';
          ctx.font = '600 17px Georgia, serif';
          ctx.fillText(i + '.', 62, y);
          ctx.font = '16px Georgia, serif';
          ctx.fillText('Explain the ' + ['mechanism', 'rate law', 'spectral shift', 'product distribution', 'yield loss', 'error source', 'apparatus choice'][i % 7] + ' and justify your answer.', 88, y);
          ctx.strokeStyle = 'rgba(23,28,26,0.18)';
          for (var l = 0; l < 3; l++) {
            ctx.beginPath();
            ctx.moveTo(88, y + 26 + l * 24);
            ctx.lineTo(w - 90 - r() * 120, y + 26 + l * 24);
            ctx.stroke();
          }
          y += 128;
        }
      });
    }
  };
  files.demoPreview = function (kind, seed) {
    var key = kind + ':' + (seed || kind);
    if (previewCache[key]) return previewCache[key];
    var gen = generators[kind] || generators.hand;
    previewCache[key] = gen(seed || kind);
    return previewCache[key];
  };
  files.kindForType = function (type) {
    if (type === 'handwritten') return 'hand';
    if (type === 'slides') return 'slide';
    if (type === 'paper') return 'paper';
    return 'hand';
  };

  N.files = files;
})();
