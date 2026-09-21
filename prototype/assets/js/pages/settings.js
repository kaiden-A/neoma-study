/* Neoma — settings, integrations (Google Calendar, Elpis MCP) and data tools. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  N.pages = N.pages || {};

  /* ---------- mocked Google Calendar OAuth ---------- */
  N.pages.googleConnect = function () {
    var s = N.store.state.settings;
    var me = N.store.me();
    ui.modal({
      title: 'Connect Google Calendar',
      subtitle: 'Prototype only — no Google account is contacted and nothing leaves this browser.',
      size: 'sm',
      body: '<div class="nm-oauth">' +
        '<div class="nm-oauth-brand">' + ui.icon('fa-brands fa-google') + '<span>Google</span></div>' +
        '<p class="nm-oauth-step">Neoma wants to:</p>' +
        '<ul class="nm-scopelist">' +
          '<li>' + ui.icon('fa-check') + 'See your calendars and events</li>' +
          '<li>' + ui.icon('fa-check') + 'Add and update events it creates</li>' +
          '<li>' + ui.icon('fa-check') + 'Reminders for assignment deadlines</li>' +
        '</ul>' +
        '<div class="nm-oauth-account">' + ui.avatar(me, 32) + '<div><strong>' + esc(me.name) + '</strong><small class="nm-mono">' + esc(me.email) + '</small></div>' +
          '<span class="nm-chip nm-chip--sm nm-chip--muted">Signed in</span></div>' +
        '<p class="nm-help">Real OAuth + two-way sync is on the roadmap. In the prototype, “connecting” turns on the Google links, .ics export and sync log.</p>' +
      '</div>',
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Allow', variant: 'primary', onClick: function () {
          N.store.updateSettings({ google: { status: 'connected', email: me.email, lastSyncAt: new Date().toISOString() } });
          N.store.pushSyncLog('Connected as ' + me.email);
          N.store.pushSyncLog('Initial sync — 0 conflicts, ' + N.store.allEvents().length + ' events available');
          N.store.touch();
          ui.toast('Google Calendar connected', { kind: 'success', icon: 'fa-brands fa-google', body: 'Use “Add to Google” on any event.' });
        } }
      ]
    });
  };

  N.pages.googleSync = function () {
    var count = N.store.allEvents().length;
    N.store.updateSettings({ google: { lastSyncAt: new Date().toISOString() } });
    N.store.pushSyncLog('Pushed ' + count + ' events · pulled 0 changes');
    N.store.touch();
    ui.toast('Sync complete', { kind: 'success', icon: 'fa-rotate', body: count + ' events up to date (simulated).' });
  };

  /* ---------- render ---------- */
  function render(ctx, root) {
    var s = N.store.state.settings;
    var me = N.store.me();

    function toggleRow(label, help, checked, key) {
      return '<label class="nm-toggle">' +
        '<input type="checkbox" data-setting="' + esc(key) + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="nm-toggle-bd"><span class="nm-toggle-label">' + esc(label) + '</span>' +
        '<span class="nm-toggle-help">' + esc(help) + '</span></span></label>';
    }

    var toolRows = N.seed.mcpTools.map(function (t) {
      return '<li class="nm-toolrow"><code class="nm-mono">' + esc(t.name) + '</code><span>' + esc(t.desc) + '</span></li>';
    }).join('');

    root.innerHTML = '<div class="nm-page nm-page--settings">' +
      ui.pageHead({
        eyebrow: 'Settings',
        title: 'How Neoma works for you',
        meta: 'Everything here is stored in this browser. No account, no server, no tracking.',
        actions: '<button type="button" class="nm-btn nm-btn--secondary" data-theme-toggle>' +
          ui.icon(s.theme === 'dark' ? 'fa-sun' : 'fa-moon') + (s.theme === 'dark' ? 'Light mode' : 'Dark mode') + '</button>'
      }) +
      '<div class="nm-settings-grid">' +

        ui.card('<div class="nm-form">' +
          ui.field({ label: 'Name', id: 'st-name', value: me.name, class: 'nm-field--full' }) +
          ui.field({ label: 'Email', id: 'st-email', type: 'email', value: me.email, class: 'nm-field--full' }) +
          ui.field({ label: 'Programme', id: 'st-program', value: me.program || '', placeholder: 'BSc Computer Science · Year 3', class: 'nm-field--full', help: 'Shows under your avatar and on invites.' }) +
          '<div class="nm-field nm-field--full"><button type="button" class="nm-btn nm-btn--primary" data-save-profile>Save profile</button></div>' +
          '</div>', { title: 'You' }) +

        ui.card(
          '<div class="nm-field"><label class="nm-label" for="st-lead">Remind me before a deadline or session</label>' +
            '<select class="nm-select" id="st-lead" data-setting="leadTimeHours">' +
              [[6, '6 hours before'], [12, '12 hours before'], [24, '1 day before'], [48, '2 days before'], [96, '4 days before'], [168, '1 week before']]
                .map(function (o) { return '<option value="' + o[0] + '"' + (Number(s.leadTimeHours) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
            '</select></div>' +
          '<div class="nm-togglelist">' +
            toggleRow('Overdue work', 'Tasks past their due date.', s.kinds.overdue !== false, 'kinds.overdue') +
            toggleRow('Due soon', 'Inside the reminder window above.', s.kinds.dueSoon !== false, 'kinds.dueSoon') +
            toggleRow('Assigned to me', 'When a teammate puts a task on you.', s.kinds.assigned !== false, 'kinds.assigned') +
            toggleRow('Study sessions', 'Group study nights, a day before and an hour before.', s.kinds.sessions !== false, 'kinds.sessions') +
            toggleRow('Exams', 'Countdown at 7, 3 and 1 day out.', s.kinds.exams !== false, 'kinds.exams') +
            toggleRow('Shared notes', 'New notes posted in your groups.', s.kinds.notes !== false, 'kinds.notes') +
          '</div>' +
          '<div class="nm-field"><button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-browser-notif>' +
            ui.icon('fa-bell') + 'Enable desktop notifications</button>' +
            '<p class="nm-help" data-notif-perm>Desktop alerts fire while this tab is open' +
            (window.Notification ? ' · permission: ' + window.Notification.permission : ' · not supported in this browser') + '</p></div>',
          { title: 'Notifications' }) +

        ui.card(
          '<div class="nm-gcal-top"><span class="nm-gcal-logo">' + ui.icon('fa-brands fa-google') + '</span>' +
            '<div><p class="nm-gcal-status">' + (s.google.status === 'connected' ? 'Connected' : 'Not connected') + '</p>' +
            '<p class="nm-meta">' + (s.google.status === 'connected'
              ? esc(s.google.email || '') + (s.google.lastSyncAt ? ' · last sync ' + esc(U.fmtRelative(s.google.lastSyncAt)) : '')
              : 'Turn on to enable Google links, .ics export and the sync log.') + '</p></div></div>' +
          '<div class="nm-inline-actions">' +
            (s.google.status === 'connected'
              ? '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-gcal-sync>Sync now</button>' +
                '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-gcal-disconnect>Disconnect</button>'
              : '<button type="button" class="nm-btn nm-btn--primary nm-btn--sm" data-gcal-connect>Connect Google Calendar</button>') +
            '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-ics-export>Export .ics</button>' +
          '</div>' +
          (s.syncLog.length ? '<ul class="nm-synclog nm-mono">' + s.syncLog.map(function (l) {
            return '<li>' + esc(U.fmtTime(l.at)) + ' — ' + esc(l.text) + '</li>';
          }).join('') + '</ul>' : ''),
          { title: 'Google Calendar' }) +

        ui.card(
          '<p class="nm-body-text">Elpis plugs in through an MCP server at <span class="nm-mono">/mcp</span>. The prototype ships the data shape and the tool surface; the server itself is next.</p>' +
          '<div class="nm-form-grid">' +
            ui.field({ label: 'MCP endpoint', id: 'st-elpis-url', value: s.elpis.url, class: 'nm-field--full', help: 'Streamable HTTP JSON-RPC, e.g. http://localhost:3333/mcp' }) +
            ui.field({ label: 'Auth token (optional)', id: 'st-elpis-token', value: s.elpis.token || '', placeholder: 'Bearer token', class: 'nm-field--full' }) +
          '</div>' +
          '<div class="nm-togglelist">' + toggleRow('Allow Elpis to read and write Neoma', 'When enabled, Elpis can list deadlines, create tasks and search your notes.', !!s.elpis.enabled, 'elpis.enabled') + '</div>' +
          '<ul class="nm-toollist">' + toolRows + '</ul>' +
          '<div class="nm-inline-actions">' +
            '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-save-elpis>Save connection</button>' +
            '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-copy-manifest>' + ui.icon('fa-copy') + 'Copy tool manifest</button>' +
          '</div>' +
          '<p class="nm-help">Resources Elpis will read: <span class="nm-mono">neoma://vault/{id}</span>, <span class="nm-mono">neoma://groups/{id}/board</span>, <span class="nm-mono">neoma://calendar/this-week</span></p>',
          { title: 'Elpis · MCP' }) +

        ui.card(
          '<p class="nm-body-text">Your data is a single JSON object in this browser plus any files in IndexedDB.</p>' +
          '<div class="nm-inline-actions">' +
            '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-export>' + ui.icon('fa-file-export') + 'Export JSON</button>' +
            '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-import>' + ui.icon('fa-file-import') + 'Import JSON</button>' +
            '<input type="file" accept="application/json" hidden data-import-file>' +
          '</div>' +
          '<hr class="nm-rule">' +
          '<p class="nm-body-text nm-meta">Danger zone — these cannot be undone.</p>' +
          '<div class="nm-inline-actions">' +
            '<button type="button" class="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm" data-clear-files>' + ui.icon('fa-broom') + 'Remove uploaded files</button>' +
            '<button type="button" class="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm" data-reset>' + ui.icon('fa-arrows-rotate') + 'Reset to demo data</button>' +
          '</div>',
          { title: 'Data' }) +

      '</div></div>';

    /* profile */
    root.querySelector('[data-save-profile]').addEventListener('click', function () {
      var me2 = N.store.me();
      me2.name = root.querySelector('#st-name').value.trim() || me2.name;
      me2.email = root.querySelector('#st-email').value.trim() || me2.email;
      me2.program = root.querySelector('#st-program').value.trim();
      N.store.touch();
      ui.toast('Profile saved', { kind: 'success' });
    });

    /* theme */
    root.querySelector('[data-theme-toggle]').addEventListener('click', function () {
      var next = N.store.state.settings.theme === 'dark' ? 'light' : 'dark';
      N.store.setTheme(next);
      ui.toast(next === 'dark' ? 'Night mode on' : 'Daylight mode on', { kind: 'info', icon: next === 'dark' ? 'fa-moon' : 'fa-sun' });
    });

    /* notification prefs */
    U.delegate(root, '[data-setting]', 'change', function (e, el) {
      var path = el.getAttribute('data-setting');
      var value = el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' && el.value.match(/^\d+$/) ? Number(el.value) : el.value);
      if (path.indexOf('.') !== -1) {
        var parts = path.split('.');
        var patch = {};
        patch[parts[0]] = {};
        patch[parts[0]][parts[1]] = value;
        N.store.updateSettings(patch);
      } else {
        var p = {}; p[path] = value;
        N.store.updateSettings(p);
      }
      U.bus.emit('notify-change');
      ui.toast('Saved', { kind: 'success', timeout: 1600 });
    });

    root.querySelector('[data-browser-notif]').addEventListener('click', function () {
      if (!window.Notification) { ui.toast('This browser has no notification support', { kind: 'danger' }); return; }
      window.Notification.requestPermission().then(function (perm) {
        N.store.updateSettings({ browserNotifications: perm === 'granted' });
        root.querySelector('[data-notif-perm]').textContent = 'Desktop alerts fire while this tab is open · permission: ' + perm;
        ui.toast(perm === 'granted' ? 'Desktop notifications on' : 'Permission not granted', { kind: perm === 'granted' ? 'success' : 'danger' });
        if (perm === 'granted') window.Notification && new Notification('Neoma', { body: 'Deadline reminders will appear here while the tab is open.' });
      });
    });

    /* integrations */
    U.delegate(root, '[data-gcal-connect]', 'click', function () { N.pages.googleConnect(); });
    U.delegate(root, '[data-gcal-sync]', 'click', function () { N.pages.googleSync(); });
    U.delegate(root, '[data-gcal-disconnect]', 'click', function () {
      ui.confirm({ title: 'Disconnect Google Calendar?', message: 'Nothing is deleted — you just lose the sync log and Google links.', confirmLabel: 'Disconnect' })
        .then(function (ok) {
          if (!ok) return;
          N.store.updateSettings({ google: { status: 'disconnected', lastSyncAt: null, email: null } });
          ui.toast('Disconnected', { kind: 'info', icon: 'fa-brands fa-google' });
        });
    });
    U.delegate(root, '[data-ics-export]', 'click', function () {
      var count = N.ics.downloadAll('neoma-study.ics');
      ui.toast(count ? count + ' events exported' : 'Nothing to export yet', { kind: count ? 'success' : 'danger', icon: 'fa-file-arrow-down' });
    });
    U.delegate(root, '[data-save-elpis]', 'click', function () {
      N.store.updateSettings({ elpis: { url: root.querySelector('#st-elpis-url').value.trim(), token: root.querySelector('#st-elpis-token').value.trim() } });
      ui.toast('Elpis connection saved', { kind: 'success', icon: 'fa-robot' });
    });
    U.delegate(root, '[data-copy-manifest]', 'click', function () {
      var manifest = {
        server: 'neoma',
        transport: 'http',
        endpoint: N.store.state.settings.elpis.url,
        version: '0.1.0-prototype',
        tools: N.seed.mcpTools.map(function (t) { return { name: t.name, description: t.desc }; }),
        resources: ['neoma://vault/{noteId}', 'neoma://groups/{groupId}/board', 'neoma://calendar/this-week']
      };
      U.copy(JSON.stringify(manifest, null, 2)).then(function (ok) {
        ui.toast(ok ? 'Tool manifest copied' : 'Copy failed', { kind: ok ? 'success' : 'danger', icon: 'fa-copy' });
      });
    });

    /* data */
    U.delegate(root, '[data-export]', 'click', function () {
      U.download('neoma-export-' + U.dayKey(new Date()) + '.json', N.store.exportJson(), 'application/json');
      ui.toast('Export downloaded', { kind: 'success', icon: 'fa-file-export' });
    });
    var importInput = root.querySelector('[data-import-file]');
    U.delegate(root, '[data-import]', 'click', function () { importInput.click(); });
    importInput.addEventListener('change', function () {
      var file = importInput.files && importInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = N.store.importJson(String(reader.result));
        if (!res.ok) { ui.toast(res.error, { kind: 'danger' }); return; }
        ui.toast('Data imported', { kind: 'success', icon: 'fa-file-import' });
        N.router.go('/today');
      };
      reader.readAsText(file);
      importInput.value = '';
    });
    U.delegate(root, '[data-clear-files]', 'click', function () {
      ui.confirm({ title: 'Remove uploaded files?', message: 'Photos, slide decks and past papers stored in this browser are deleted. Notes and text stay.', confirmLabel: 'Remove files', variant: 'danger' })
        .then(function (ok) {
          if (!ok) return;
          N.store.clearFiles().then(function () { ui.toast('Uploaded files removed', { kind: 'info' }); });
        });
    });
    U.delegate(root, '[data-reset]', 'click', function () {
      ui.confirm({
        title: 'Reset to demo data?', message: 'Everything you changed — tasks, notes, groups, settings — is replaced by the sample semester.', confirmLabel: 'Reset everything', variant: 'danger'
      }).then(function (ok) {
        if (!ok) return;
        N.store.resetDemo();
        ui.toast('Demo data restored', { kind: 'success', icon: 'fa-arrows-rotate' });
        N.router.go('/today');
      });
    });
  }

  N.router.add('/settings', render, { title: function () { return 'Settings'; } });
})();
