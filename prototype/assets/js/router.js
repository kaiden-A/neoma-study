/* Neoma — hash router with a slim render pipeline. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util;

  var routes = [];
  var cleanups = [];
  var current = { path: '', params: {}, query: {}, route: null, hash: '' };

  function parseHash() {
    var raw = window.location.hash.replace(/^#\/?/, '');
    var parts = raw.split('?');
    var segs = parts[0].split('/').filter(Boolean);
    var query = {};
    (parts[1] || '').split('&').filter(Boolean).forEach(function (pair) {
      var kv = pair.split('=');
      query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
    return { segments: segs, query: query };
  }

  function match(segments) {
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.segments.length !== segments.length) continue;
      var params = {};
      var ok = true;
      for (var j = 0; j < r.segments.length; j++) {
        var pat = r.segments[j];
        if (pat.charAt(0) === ':') params[pat.slice(1)] = decodeURIComponent(segments[j]);
        else if (pat !== segments[j]) { ok = false; break; }
      }
      if (ok) return { route: r, params: params };
    }
    return null;
  }

  var router = {
    go: function (path) {
      var clean = String(path || '').replace(/^#/, '');
      if (clean.charAt(0) !== '/') clean = '/' + clean;
      if (window.location.hash.replace(/^#/, '') === clean) { router.render({ keepScroll: true, keepFocus: true }); return; }
      window.location.hash = clean;
    },
    replace: function (path) {
      var clean = String(path || '').replace(/^#/, '');
      window.location.replace(window.location.pathname + window.location.search + '#' + clean);
    },
    add: function (pattern, handler, opts) {
      routes.push({
        segments: pattern.split('/').filter(Boolean),
        pattern: pattern,
        handler: handler,
        opts: opts || {}
      });
    },
    current: function () { return current; },
    onCleanup: function (fn) { cleanups.push(fn); },
    runCleanups: function () {
      cleanups.splice(0).forEach(function (fn) {
        try { fn(); } catch (e) { console.error(e); }
      });
      /* drop the previous page's delegated listeners before the DOM is replaced */
      U.releaseDelegates(document.getElementById('view'));
      N.files.releaseUrls();
      N.ui.closeMenu();
    },
    render: function (opts) {
      opts = opts || {};
      var parsed = parseHash();
      var found = match(parsed.segments);
      var view = document.getElementById('view');
      if (!view) return;

      var sameRoute = current.hash === window.location.hash;
      if (!opts.keepScroll && !sameRoute) window.scrollTo(0, 0);

      router.runCleanups();

      /* Only planner-shaped pages draw the paper grid; the rest stay plain. */
      view.classList.toggle('nm-view--grid', !!(found && found.route.opts.grid));

      if (!found) {
        current = { path: parsed.segments.join('/'), params: {}, query: parsed.query, route: null, hash: window.location.hash };
        view.innerHTML = N.pages.notFound();
        document.title = 'Not found · Neoma';
        return;
      }

      current = {
        path: parsed.segments.join('/'),
        params: found.params,
        query: parsed.query,
        route: found.route,
        hash: window.location.hash
      };

      var ctx = {
        params: found.params,
        query: parsed.query,
        path: current.path,
        onCleanup: router.onCleanup,
        manual: !!found.route.opts.manual
      };

      try {
        found.route.handler(ctx, view);
      } catch (err) {
        console.error('Neoma route error:', err);
        view.innerHTML = '<div class="nm-page"><div class="nm-card"><div class="nm-card-bd">' +
          '<h1 class="nm-title">Something broke on this page</h1>' +
          '<p class="nm-body-text">' + U.escapeHtml(err && err.message ? err.message : String(err)) + '</p>' +
          '<p class="nm-body-text"><a class="nm-btn nm-btn--secondary" href="#/today">Back to Today</a></p>' +
          '</div></div></div>';
      }

      N.ui.hydrateThumbs(view);
      var label = found.route.opts.title ? found.route.opts.title(ctx) : 'Neoma';
      document.title = label + ' · Neoma';
      var ann = document.getElementById('route-announce');
      if (ann) ann.textContent = label;

      U.qsa('[data-route]').forEach(function (el) {
        var target = el.getAttribute('data-route');
        var active = current.path === target || (target !== 'today' && current.path.indexOf(target + '/') === 0);
        el.classList.toggle('is-active', active);
        if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
      });

      if (!opts.keepFocus) {
        var heading = view.querySelector('#page-title');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        }
      }
    },

    start: function () {
      if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
        router.replace('/today');
      }
      window.addEventListener('hashchange', function () { router.render(); });
      N.store.on(function () {
        if (current.route && current.route.opts.manual) return;
        router.render({ keepScroll: true, keepFocus: true });
      });
      router.render();
    }
  };

  N.router = router;
})();
