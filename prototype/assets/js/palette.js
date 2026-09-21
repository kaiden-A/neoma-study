/* Neoma — command palette (Ctrl/Cmd + K). */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  var RECENT_KEY = 'neoma.recent';

  var el = null, inputEl = null, listEl = null, results = [], activeIndex = 0;

  function staticCommands() {
    return [
      { id: 'page.today', label: 'Go to Today', icon: 'fa-house', hint: 'Page', keywords: 'home brief dashboard', run: function () { N.router.go('/today'); } },
      { id: 'page.groups', label: 'Go to Groups', icon: 'fa-users', hint: 'Page', keywords: 'projects teams', run: function () { N.router.go('/groups'); } },
      { id: 'page.tasks', label: 'Go to My to-do', icon: 'fa-list-check', hint: 'Page', keywords: 'todo personal tasks list checklist', run: function () { N.router.go('/tasks'); } },
      { id: 'page.vault', label: 'Go to Notes', icon: 'fa-note-sticky', hint: 'Page', keywords: 'notes study storage vault', run: function () { N.router.go('/vault'); } },
      { id: 'page.calendar', label: 'Go to Calendar', icon: 'fa-calendar-days', hint: 'Page', keywords: 'dates exams', run: function () { N.router.go('/calendar'); } },
      { id: 'page.notifications', label: 'Go to Notifications', icon: 'fa-bell', hint: 'Page', keywords: 'alerts reminders', run: function () { N.router.go('/notifications'); } },
      { id: 'page.settings', label: 'Go to Settings', icon: 'fa-sliders', hint: 'Page', keywords: 'integrations google elpis', run: function () { N.router.go('/settings'); } },
      { id: 'action.new-task', label: 'New task or to-do', icon: 'fa-plus', hint: 'Action', keywords: 'create deadline todo personal checklist', run: function () { N.taskModal.open({}); } },
      { id: 'action.new-group', label: 'New group', icon: 'fa-users', hint: 'Action', keywords: 'create team project', run: function () { N.pages.newGroupModal({ kind: 'project' }); } },
      { id: 'action.new-study-group', label: 'New study group', icon: 'fa-note-sticky', hint: 'Action', keywords: 'create friends share notes study', run: function () { N.pages.newGroupModal({ kind: 'study' }); } },
      { id: 'action.new-event', label: 'New calendar event', icon: 'fa-calendar-plus', hint: 'Action', keywords: 'exam session meeting', run: function () { N.pages.eventModal({}); } },
      { id: 'action.add-vault', label: 'Add note or file', icon: 'fa-arrow-up-from-bracket', hint: 'Action', keywords: 'upload note photo slides', run: function () { N.pages.addItemModal({}); } },
      { id: 'action.export-ics', label: 'Export calendar (.ics)', icon: 'fa-file-arrow-down', hint: 'Action', keywords: 'google sync download', run: function () {
          var count = N.ics.downloadAll('neoma-study.ics');
          ui.toast(count ? count + ' events exported' : 'Nothing to export yet', { kind: count ? 'success' : 'danger' });
        } },
      { id: 'action.theme', label: 'Toggle dark mode', icon: 'fa-moon', hint: 'Action', keywords: 'theme night light', run: function () {
          N.store.setTheme(N.store.state.settings.theme === 'dark' ? 'light' : 'dark');
        } }
    ];
  }

  function build() {
    var out = staticCommands().slice();
    N.store.state.groups.forEach(function (g) {
      out.push({
        id: 'group.' + g.id, label: g.name, icon: g.kind === 'study' ? 'fa-note-sticky' : 'fa-users',
        hint: (g.kind === 'study' ? 'Study group' : 'Project group') + (g.subject ? ' · ' + g.subject : ''),
        keywords: 'group ' + g.subject + ' ' + g.name,
        run: function () { N.router.go('/groups/' + g.id); }
      });
    });
    U.sortBy(N.store.personalNotes(), function (n) { return n.updatedAt; }, 'desc').slice(0, 12).forEach(function (n) {
      out.push({
        id: 'note.' + n.id, label: n.title, icon: ui.noteType(n.type).icon, hint: 'Notes · ' + ui.noteType(n.type).label,
        keywords: 'note vault ' + (n.tags || []).join(' ') + ' ' + n.body,
        run: function () { N.router.go('/vault/' + n.id); }
      });
    });
    U.sortBy(N.store.state.tasks.filter(function (t) { return t.status !== 'done'; }), function (t) { return t.dueAt || '9999'; }).slice(0, 10).forEach(function (t) {
      out.push({
        id: 'task.' + t.id, label: t.title, icon: 'fa-list-check', hint: 'Task · ' + (t.dueAt ? U.fmtRelative(t.dueAt) : 'no date'),
        keywords: 'task ' + t.title + ' ' + t.description,
        run: function () { N.taskModal.open({ task: t }); }
      });
    });
    U.sortBy(N.store.state.events, function (e) { return e.start; }).filter(function (e) { return new Date(e.start) >= new Date(Date.now() - U.MS.day); }).slice(0, 6).forEach(function (e) {
      out.push({
        id: 'event.' + e.id, label: e.title, icon: ui.eventType(e.type).icon, hint: ui.eventType(e.type).label + ' · ' + U.fmtDateTime(e.start),
        keywords: 'event calendar ' + e.title,
        run: function () { N.pages.eventModal({ event: e }); }
      });
    });
    return out;
  }

  function recentIds() { return U.storage.get(RECENT_KEY, []); }
  function remember(id) {
    var list = recentIds().filter(function (x) { return x !== id; });
    list.unshift(id);
    U.storage.set(RECENT_KEY, list.slice(0, 6));
  }

  function filter(all, query) {
    var q = query.trim().toLowerCase();
    if (!q) {
      var recents = recentIds();
      var out = [];
      recents.forEach(function (id) {
        all.forEach(function (c) { if (c.id === id) out.push(c); });
      });
      return { recent: out.slice(0, 4), matches: all.slice(0, 9) };
    }
    var matches = all.filter(function (c) {
      return U.match(c.label, q) || U.match(c.keywords || '', q) || U.match(c.hint || '', q);
    }).slice(0, 14);
    return { recent: [], matches: matches };
  }

  function paint() {
    var all = build();
    var res = filter(all, inputEl.value);
    results = res.recent.concat(res.matches);
    if (activeIndex >= results.length) activeIndex = Math.max(0, results.length - 1);

    var html = '';
    function section(title, items, offset) {
      if (!items.length) return '';
      return '<p class="nm-palette-label nm-mono">' + esc(title) + '</p>' +
        items.map(function (c, i) {
          var idx = offset + i;
          return '<button type="button" class="nm-palette-item' + (idx === activeIndex ? ' is-active' : '') + '" data-palette-index="' + idx + '" role="option" aria-selected="' + (idx === activeIndex) + '">' +
            '<span class="nm-palette-icon">' + ui.icon(c.icon) + '</span>' +
            '<span class="nm-palette-text">' + esc(c.label) + '</span>' +
            '<span class="nm-palette-hint nm-mono">' + esc(c.hint) + '</span></button>';
        }).join('');
    }
    if (res.recent.length) html += section('Recent', res.recent, 0);
    html += section(inputEl.value.trim() ? 'Results' : 'Jump to', res.matches, res.recent.length);
    if (!results.length) {
      html = '<div class="nm-palette-empty">' + ui.icon('fa-magnifying-glass') +
        '<p>No match for “' + esc(inputEl.value) + '”</p><small>Try a group name, a note title or an action like “new task”.</small></div>';
    }
    listEl.innerHTML = html;
  }

  function close() {
    if (!el) return;
    var node = el;
    el = null;
    node.classList.add('is-leaving');
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 130);
    document.body.classList.remove('has-overlay');
  }

  function activate(index) {
    var cmd = results[index];
    if (!cmd) return;
    remember(cmd.id);
    close();
    setTimeout(function () { cmd.run(); }, 10);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, results.length - 1); paint(); scrollActive(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); paint(); scrollActive(); return; }
    if (e.key === 'Enter') { e.preventDefault(); activate(activeIndex); }
  }
  function scrollActive() {
    var active = listEl.querySelector('.nm-palette-item.is-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  N.palette = {
    open: function () {
      if (el) { inputEl.focus(); return; }
      el = U.node('<div class="nm-overlay nm-overlay--palette"></div>');
      el.innerHTML = '<div class="nm-palette" role="dialog" aria-modal="true" aria-label="Command palette">' +
        '<div class="nm-palette-input"><span class="nm-search-icon">' + ui.icon('fa-magnifying-glass') + '</span>' +
        '<input type="text" placeholder="Search or run a command…" aria-label="Search or run a command" autocomplete="off">' +
        ui.kbd('esc') + '</div>' +
        '<div class="nm-palette-list" role="listbox"></div>' +
        '<div class="nm-palette-ft nm-mono">' + ui.kbd('↑') + ui.kbd('↓') + ' to move · ' + ui.kbd('↵') + ' to open</div></div>';
      (document.getElementById('overlays') || document.body).appendChild(el);
      document.body.classList.add('has-overlay');
      inputEl = el.querySelector('input');
      listEl = el.querySelector('.nm-palette-list');
      activeIndex = 0;
      paint();
      inputEl.focus();
      inputEl.addEventListener('input', function () { activeIndex = 0; paint(); });
      inputEl.addEventListener('keydown', onKey);
      el.addEventListener('mousedown', function (e) { if (e.target === el) close(); });
      U.delegate(el, '[data-palette-index]', 'click', function (e, btn) { activate(Number(btn.getAttribute('data-palette-index'))); });
      U.delegate(el, '[data-palette-index]', 'mousemove', function (e, btn) {
        var idx = Number(btn.getAttribute('data-palette-index'));
        if (idx !== activeIndex) { activeIndex = idx; U.qsa('.nm-palette-item', listEl).forEach(function (b) { b.classList.toggle('is-active', b === btn); }); }
      });
    },
    close: close,
    init: function () {
      document.addEventListener('keydown', function (e) {
        var mod = e.ctrlKey || e.metaKey;
        if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); N.palette.open(); }
        else if (e.key === '/' && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '') && !el) {
          e.preventDefault();
          N.palette.open();
        }
      });
    }
  };
})();
