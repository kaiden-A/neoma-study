/* Neoma — My to-do: personal tasks, grouped by when they are due. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  N.pages = N.pages || {};

  var view = { includeGroup: false, showAllDone: false, addMode: 'today' };

  var SECTIONS = [
    { id: 'overdue', label: 'Overdue', match: function (days) { return days < 0; } },
    { id: 'today', label: 'Today', match: function (days) { return days === 0; } },
    { id: 'tomorrow', label: 'Tomorrow', match: function (days) { return days === 1; } },
    { id: 'week', label: 'Next 7 days', match: function (days) { return days > 1 && days <= 7; } },
    { id: 'later', label: 'Later', match: function (days) { return days > 7; } }
  ];

  /* ---------- composer (shared with Home) ---------- */
  N.pages.todoComposer = function (opts) {
    opts = opts || {};
    var modes = [
      { id: 'today', label: 'Today' },
      { id: 'tomorrow', label: 'Tomorrow' },
      { id: 'none', label: 'No date' }
    ];
    return '<div class="nm-todo-add" data-todo-composer>' +
      '<input class="nm-input nm-todo-input" data-todo-input placeholder="' + esc(opts.placeholder || 'Add something to your list…') + '" aria-label="Add a to-do">' +
      '<div class="nm-todo-modes" role="group" aria-label="When">' +
        modes.map(function (m) {
          return '<button type="button" class="nm-chip nm-chip--sm nm-chip--link' + (view.addMode === m.id ? ' is-active' : '') + '" data-todo-mode="' + m.id + '" aria-pressed="' + (view.addMode === m.id) + '">' + m.label + '</button>';
        }).join('') +
      '</div>' +
      '<button type="button" class="nm-btn nm-btn--primary nm-btn--sm" data-todo-add>' + ui.icon('fa-plus') + 'Add</button>' +
      '</div>';
  };

  N.pages.addTodoFromComposer = function (root) {
    var composer = root.querySelector('[data-todo-composer]');
    if (!composer) return null;
    var input = composer.querySelector('[data-todo-input]');
    var title = input.value.trim();
    if (!title) { input.focus(); return null; }
    var dueAt = null;
    if (view.addMode === 'today') {
      var today = new Date();
      today.setHours(18, 0, 0, 0);
      dueAt = today.toISOString();
    } else if (view.addMode === 'tomorrow') {
      var tomorrow = U.addDays(new Date(), 1);
      tomorrow.setHours(9, 0, 0, 0);
      dueAt = tomorrow.toISOString();
    }
    var task = N.store.createTask({ title: title, groupId: null, dueAt: dueAt, priority: 'med' });
    input.value = '';
    ui.toast('Added to your list', { kind: 'success', icon: 'fa-list-check' });
    return task;
  };

  N.pages.bindTodoComposer = function (root, onChange) {
    var composer = root.querySelector('[data-todo-composer]');
    if (!composer) return;
    var input = composer.querySelector('[data-todo-input]');
    function add() { if (N.pages.addTodoFromComposer(root) && onChange) onChange(); }
    composer.querySelector('[data-todo-add]').addEventListener('click', add);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    U.delegate(composer, '[data-todo-mode]', 'click', function (e, btn) {
      view.addMode = btn.getAttribute('data-todo-mode');
      U.qsa('[data-todo-mode]', composer).forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      input.focus();
    });
  };

  /* ---------- grouping ---------- */
  function buckets(tasks) {
    var map = { overdue: [], today: [], tomorrow: [], week: [], later: [], nodate: [], done: [] };
    tasks.forEach(function (t) {
      if (t.status === 'done') { map.done.push(t); return; }
      if (!t.dueAt) { map.nodate.push(t); return; }
      var days = U.daysUntil(t.dueAt);
      for (var i = 0; i < SECTIONS.length; i++) {
        if (SECTIONS[i].match(days)) { map[SECTIONS[i].id].push(t); return; }
      }
      map.later.push(t);
    });
    Object.keys(map).forEach(function (k) {
      map[k] = U.sortBy(map[k], function (t) { return t.dueAt || '9999'; });
    });
    return map;
  }

  function section(title, tasks, opts) {
    opts = opts || {};
    if (!tasks.length) return '';
    return '<section class="nm-todo-section' + (opts.danger ? ' nm-todo-section--danger' : '') + '">' +
      '<h2 class="nm-todo-heading">' + esc(title) + '<span class="nm-mono">' + tasks.length + '</span>' +
        (opts.action || '') + '</h2>' +
      '<ul class="nm-tasklist">' + tasks.map(function (t) {
        return ui.taskRow(t, {
          menu: 'data-todo-menu',
          hideGroup: !view.includeGroup,
          timeOnly: opts.timeOnly,
          dial: opts.dial !== false
        });
      }).join('') + '</ul></section>';
  }

  function rowMenu(anchor, task) {
    ui.menu(anchor, [
      { label: 'Edit', icon: 'fa-pen', onClick: function () { N.taskModal.open({ task: task }); } },
      { label: 'Postpone to tomorrow', icon: 'fa-calendar-plus', onClick: function () {
        N.store.postponeTask(task.id);
        ui.toast('Moved to tomorrow', { kind: 'success', icon: 'fa-calendar-plus', actionLabel: 'Undo',
          onAction: function () { N.store.updateTask(task.id, { dueAt: task.dueAt }, { quiet: true }); } });
      } },
      { label: 'Duplicate', icon: 'fa-clone', onClick: function () {
        var copy = N.store.duplicateTask(task.id);
        if (copy) ui.toast('Duplicated', { kind: 'success', actionLabel: 'Open', onAction: function () { N.taskModal.open({ task: copy }); } });
      } },
      { sep: true },
      { label: 'Delete', icon: 'fa-trash', danger: true, onClick: function () {
        ui.confirm({ title: 'Delete “' + task.title + '”?', message: 'It disappears from your list, the calendar and reminders.', confirmLabel: 'Delete', variant: 'danger' })
          .then(function (ok) { if (ok) { N.store.deleteTask(task.id); ui.toast('Deleted', { kind: 'info' }); } });
      } }
    ]);
  }

  /* ---------- page ---------- */
  function render(ctx, root) {
    var personal = N.store.personalTasks();
    var groupTasks = N.store.state.tasks.filter(function (t) { return t.groupId && t.status !== 'done'; });
    var open = personal.filter(function (t) { return t.status !== 'done'; }).length;
    var doneToday = personal.filter(function (t) {
      return t.status === 'done' && t.completedAt && U.isSameDay(new Date(t.completedAt), new Date());
    }).length;
    var list = view.includeGroup ? N.store.state.tasks : personal;
    var map = buckets(list);
    var doneList = view.showAllDone ? map.done : map.done.filter(function (t) {
      return t.completedAt && U.isSameDay(new Date(t.completedAt), new Date());
    });

    root.innerHTML = '<div class="nm-page nm-page--todo">' +
      ui.pageHead({
        eyebrow: 'My to-do · <span class="nm-mono">' + open + ' open</span>' +
          (doneToday ? ' · <span class="nm-mono">' + doneToday + ' done today</span>' : ''),
        title: 'My to-do',
        meta: 'Personal tasks only — group work stays on its group board.',
        actions: '<button type="button" class="nm-btn nm-btn--primary" data-new-task>' + ui.icon('fa-plus') + 'New task</button>'
      }) +
      ui.card(N.pages.todoComposer({})) +
      '<div class="nm-todo-toggle">' +
        '<label class="nm-check nm-check--switch"><input type="checkbox" data-include-group' + (view.includeGroup ? ' checked' : '') + '><span>Include group work</span></label>' +
        '<span class="nm-mono nm-meta">' + (view.includeGroup
          ? 'showing ' + groupTasks.length + ' open group task' + (groupTasks.length === 1 ? '' : 's')
          : groupTasks.length + ' open group task' + (groupTasks.length === 1 ? '' : 's') + ' hidden') + '</span>' +
      '</div>' +
      '<div data-todo-list>' + renderList(map, doneList) + '</div>' +
      '</div>';

    function onListChange() { N.router.render({ keepScroll: true, keepFocus: true }); }
    N.pages.bindTodoComposer(root, onListChange);

    U.delegate(root, '[data-include-group]', 'change', function (e, el) {
      view.includeGroup = el.checked;
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-new-task]', 'click', function () { N.taskModal.open({}); });
    U.delegate(root, '[data-empty-action]', 'click', function () {
      var input = root.querySelector('[data-todo-input]');
      if (input) input.focus();
    });
    U.delegate(root, '[data-todo-menu]', 'click', function (e, btn) {
      e.stopPropagation();
      var task = N.store.taskById(btn.getAttribute('data-todo-menu'));
      if (task) rowMenu(btn, task);
    });
    U.delegate(root, '[data-task-toggle]', 'click', function (e, btn) {
      e.stopPropagation();
      var task = N.store.taskById(btn.getAttribute('data-task-toggle'));
      if (!task) return;
      var was = task.status;
      var next = was === 'done' ? 'todo' : 'done';
      N.store.updateTask(task.id, { status: next }, { quiet: true });
      if (next === 'done') {
        ui.toast('“' + U.truncate(task.title, 30) + '” done', {
          kind: 'success', icon: 'fa-check', actionLabel: 'Undo',
          onAction: function () { N.store.updateTask(task.id, { status: was }, { quiet: true }); }
        });
      }
    });
    U.delegate(root, '[data-task]', 'click', function (e, row) {
      if (e.target.closest('[data-task-toggle]') || e.target.closest('[data-todo-menu]')) return;
      var task = N.store.taskById(row.getAttribute('data-task'));
      if (task) N.taskModal.open({ task: task });
    });
    U.delegate(root, '[data-done-toggle]', 'click', function () {
      view.showAllDone = !view.showAllDone;
      N.router.render({ keepScroll: true, keepFocus: true });
    });
  }

  function renderList(map, doneList) {
    var html = SECTIONS.map(function (s) {
      return section(s.label, map[s.id], { danger: s.id === 'overdue', timeOnly: s.id === 'today' });
    }).join('');
    html += section('No date', map.nodate, { dial: false });
    if (doneList.length || map.done.length) {
      var extra = view.showAllDone ? 'Show today only' : 'Show all ' + map.done.length;
      html += '<section class="nm-todo-section nm-todo-section--done">' +
        '<h2 class="nm-todo-heading">Done' +
          '<span class="nm-mono">' + doneList.length + '</span>' +
          (map.done.length > doneList.length || view.showAllDone
            ? '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm nm-todo-donetoggle" data-done-toggle>' + extra + '</button>'
            : '') +
        '</h2>' +
        (doneList.length
          ? '<ul class="nm-tasklist">' + doneList.map(function (t) {
              return ui.taskRow(t, { menu: 'data-todo-menu', hideGroup: !view.includeGroup, timeOnly: true, dial: false });
            }).join('') + '</ul>'
          : '<p class="nm-help">Nothing finished today yet.</p>') +
        '</section>';
    }
    var total = Object.keys(map).reduce(function (n, k) { return n + map[k].length; }, 0);
    if (!total) {
      return ui.empty({
        icon: 'fa-list-check',
        title: 'Your list is empty',
        body: 'Add today’s three things above — or flip on “Include group work” to see everything you owe this week.',
        actionLabel: 'Add a to-do'
      });
    }
    return html;
  }

  N.router.add('/tasks', render, { title: function () { return 'My to-do'; } });
})();
