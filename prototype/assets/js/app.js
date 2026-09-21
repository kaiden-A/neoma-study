/* Neoma — boot: shell wiring, global shortcuts, badge updates. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;

  N.pages = N.pages || {};
  N.pages.notFound = function () {
    return '<div class="nm-page">' +
      '<div class="nm-404">' +
        '<span class="nm-404-moon">' + U.moonSvg(0.15, 'muted', 72) + '</span>' +
        '<p class="nm-eyebrow">Error 404</p>' +
        '<h1 class="nm-title" id="page-title">This page drifted off</h1>' +
        '<p class="nm-body-text">The link points at something Neoma does not have — a deleted group, a mistyped route, or an invite that expired.</p>' +
        '<div class="nm-inline-actions"><a class="nm-btn nm-btn--primary" href="#/today">Back to Today</a>' +
        '<a class="nm-btn nm-btn--ghost" href="#/groups">Your groups</a></div>' +
      '</div></div>';
  };

  /* ---------- global quick capture ---------- */
  function quickCapture() {
    var folders = N.store.state.folders;
    var groups = N.store.state.groups;
    var mode = 'note';
    ui.modal({
      title: 'Quick capture',
      subtitle: 'One field. Neoma files it where it belongs.',
      size: 'sm',
      body: '<div class="nm-seg nm-seg--wide" role="tablist">' +
          '<button type="button" role="tab" class="nm-seg-btn is-active" data-qc-mode="note">' + ui.icon('fa-note-sticky') + 'Note</button>' +
          '<button type="button" role="tab" class="nm-seg-btn" data-qc-mode="task">' + ui.icon('fa-list-check') + 'Task</button>' +
          '<button type="button" role="tab" class="nm-seg-btn" data-qc-mode="event">' + ui.icon('fa-calendar-plus') + 'Event</button>' +
        '</div>' +
        ui.field({ label: 'What is it?', id: 'qc-title', placeholder: 'Say it in one line', class: 'nm-field--full' }) +
        '<div data-qc-extra>' + ui.field({
          label: 'File under', id: 'qc-folder', type: 'select', class: 'nm-field--full',
          options: folders.map(function (f) { return { value: f.id, label: f.name }; })
        }) + '</div>',
      footerHtml: '<span class="nm-spacer"></span><button type="button" class="nm-btn nm-btn--ghost" data-qc-cancel>Cancel</button>' +
        '<button type="button" class="nm-btn nm-btn--primary" data-qc-save>Capture</button>',
      onMount: function (panel, close) {
        var extra = panel.querySelector('[data-qc-extra]');
        function renderExtra() {
          if (mode === 'note') {
            extra.innerHTML = ui.field({
              label: 'File under', id: 'qc-folder', type: 'select', class: 'nm-field--full',
              options: folders.map(function (f) { return { value: f.id, label: f.name }; })
            });
          } else if (mode === 'task') {
            extra.innerHTML = '<div class="nm-form-grid">' +
              ui.field({
                label: 'List', id: 'qc-group', type: 'select',
                options: [{ value: '', label: 'My to-do (personal)' }].concat(groups.map(function (g) { return { value: g.id, label: g.name }; }))
              }) +
              ui.field({ label: 'Due', id: 'qc-due', type: 'datetime-local', value: U.toInputValue(U.addDays(new Date(), 3)) }) + '</div>';
          } else {
            extra.innerHTML = '<div class="nm-form-grid">' +
              ui.field({ label: 'Type', id: 'qc-etype', type: 'select', value: 'session', options: N.store.EVENT_TYPES.map(function (t) { return { value: t, label: N.store.EVENT_TYPE_LABEL[t] }; }) }) +
              ui.field({ label: 'When', id: 'qc-estart', type: 'datetime-local', value: U.toInputValue(U.addDays(new Date(), 1)) }) + '</div>';
          }
        }
        U.qsa('[data-qc-mode]', panel).forEach(function (btn) {
          btn.addEventListener('click', function () {
            mode = btn.getAttribute('data-qc-mode');
            U.qsa('[data-qc-mode]', panel).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
            renderExtra();
          });
        });
        panel.querySelector('[data-qc-cancel]').addEventListener('click', close);
        function save() {
          var title = panel.querySelector('#qc-title');
          if (!title.value.trim()) { title.focus(); return; }
          if (mode === 'note') {
            var f = panel.querySelector('#qc-folder');
            var note = N.store.createNote({ type: 'note', title: title.value.trim(), folderId: f ? f.value : null });
            ui.toast('Captured to your notes', { kind: 'success', icon: 'fa-note-sticky', actionLabel: 'Open', onAction: function () { N.router.go('/vault/' + note.id); } });
          } else if (mode === 'task') {
            var g = panel.querySelector('#qc-group');
            var d = panel.querySelector('#qc-due');
            var groupId = g && g.value ? g.value : null;
            N.store.createTask({
              title: title.value.trim(), groupId: groupId,
              assigneeIds: groupId ? [N.store.state.session.userId] : [],
              dueAt: d && d.value ? U.fromInputValue(d.value).toISOString() : null
            });
            ui.toast(groupId ? 'Task added to the group' : 'Added to your to-do', { kind: 'success', icon: 'fa-list-check' });
          } else {
            var et = panel.querySelector('#qc-etype');
            var st = panel.querySelector('#qc-estart');
            N.store.createEvent({
              title: title.value.trim(), type: et ? et.value : 'session',
              start: st && st.value ? U.fromInputValue(st.value).toISOString() : new Date().toISOString()
            });
            ui.toast('Event added', { kind: 'success', icon: 'fa-calendar-plus' });
          }
          close();
        }
        panel.querySelector('[data-qc-save]').addEventListener('click', save);
        panel.querySelector('#qc-title').addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
        panel.querySelector('#qc-title').focus();
      }
    });
  }
  N.pages.quickCapture = quickCapture;

  /* ---------- badges ---------- */
  function updateBadges() {
    var count = N.notify.unread().length;
    U.qsa('[data-bell-badge]').forEach(function (el) {
      el.textContent = count > 9 ? '9+' : String(count);
      el.hidden = count === 0;
    });
    U.qsa('[data-bell]').forEach(function (el) {
      el.classList.toggle('has-unread', count > 0);
      el.setAttribute('aria-label', count ? 'Notifications, ' + count + ' unread' : 'Notifications');
    });
    var dueEl = document.querySelector('[data-rail-next]');
    if (dueEl) {
      var stats = N.store.stats();
      var next = N.store.upcomingTasks(21, 1)[0];
      if (next) {
        var group = N.store.groupById(next.groupId);
        dueEl.innerHTML = '<a class="nm-railcard" href="#/today" title="' + esc(next.title + ' — due ' + U.fmtDateTime(next.dueAt)) + '">' +
          '<p class="nm-railcard-label nm-mono">Next deadline</p>' +
          '<div class="nm-railcard-body">' + U.dial(next.dueAt, false) + '</div>' +
          '<p class="nm-railcard-meta nm-mono">' + esc(group ? group.subject : 'Personal') + '</p></a>';
      } else {
        dueEl.innerHTML = '<div class="nm-railcard">' +
          '<p class="nm-railcard-label nm-mono">Next deadline</p>' +
          '<p class="nm-railcard-meta">' + (stats.openTasks ? 'Nothing dated yet' : 'All clear') + '</p></div>';
      }
    }
    var avatar = document.querySelector('[data-avatar]');
    if (avatar) {
      var me = N.store.me();
      avatar.innerHTML = ui.avatar(me, 30);
      avatar.setAttribute('aria-label', 'Account: ' + me.name);
    }
    var themeBtn = document.querySelector('[data-avatar-theme]');
    if (themeBtn) themeBtn.textContent = N.store.state.settings.theme === 'dark' ? 'Light mode' : 'Dark mode';
  }

  function wireShell() {
    U.delegate(document.body, '[data-palette-open]', 'click', function () { N.palette.open(); });
    U.delegate(document.body, '[data-quick-capture]', 'click', function () { quickCapture(); });
    U.delegate(document.body, '[data-bell]', 'click', function () { N.router.go('/notifications'); });

    U.delegate(document.body, '[data-avatar]', 'click', function (e, btn) {
      ui.menu(btn, [
        { header: (N.store.me() || {}).name || 'You' },
        { label: 'Settings', icon: 'fa-sliders', onClick: function () { N.router.go('/settings'); } },
        { label: 'My to-do', icon: 'fa-list-check', onClick: function () { N.router.go('/tasks'); } },
        { label: 'Your notes', icon: 'fa-note-sticky', onClick: function () { N.router.go('/vault'); } },
        { label: 'Toggle theme', icon: 'fa-circle-half-stroke', onClick: function () {
          N.store.setTheme(N.store.state.settings.theme === 'dark' ? 'light' : 'dark');
        } },
        { sep: true },
        { label: 'Export data', icon: 'fa-file-export', onClick: function () {
          U.download('neoma-export-' + U.dayKey(new Date()) + '.json', N.store.exportJson(), 'application/json');
          ui.toast('Export downloaded', { kind: 'success' });
        } },
        { label: 'Reset demo data', icon: 'fa-arrows-rotate', danger: true, onClick: function () {
          ui.confirm({ title: 'Reset to demo data?', message: 'Your changes are replaced by the sample semester.', confirmLabel: 'Reset', variant: 'danger' })
            .then(function (ok) { if (ok) { N.store.resetDemo(); ui.toast('Demo data restored', { kind: 'success' }); N.router.go('/today'); } });
        } }
      ]);
    });

    var mobileCapture = document.querySelector('[data-mobile-capture]');
    if (mobileCapture) mobileCapture.addEventListener('click', quickCapture);
  }

  /* ---------- boot ---------- */
  function boot() {
    N.store.init();
    N.palette.init();
    wireShell();
    N.router.add('/notfound', function (ctx, root) { root.innerHTML = N.pages.notFound(); });
    N.router.start();
    N.notify.watch();
    U.bus.on('change', updateBadges);
    U.bus.on('notify-change', updateBadges);
    updateBadges();
    /* Route the topbar search hint to the right shortcut name per platform. */
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    U.qsa('[data-kbd-hint]').forEach(function (el) { el.textContent = isMac ? '⌘K' : 'Ctrl K'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
