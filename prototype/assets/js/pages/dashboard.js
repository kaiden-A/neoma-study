/* Neoma — Home: today's date, the month at a glance, what's due, your groups. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;

  var anchor = new Date();          /* month shown in the mini calendar */
  var selectedDay = null;           /* day filtered in the agenda, if any */

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function label(item) {
    return item.kind === 'task' ? 'Task' : ui.eventType(item.type).label;
  }

  function openItem(id) {
    if (id.indexOf('task:') === 0) {
      var t = N.store.taskById(id.slice(5));
      if (t) N.taskModal.open({ task: t });
    } else if (id.indexOf('event:') === 0) {
      var e = N.store.eventById(id.slice(6));
      if (e) N.pages.eventModal({ event: e });
    }
  }

  /* ---------- mini month calendar ---------- */
  function miniCalendar() {
    var cells = U.monthGrid(anchor);
    var month = anchor.getMonth();
    var today = new Date();
    return '<div class="nm-minical">' +
      '<div class="nm-minical-head">' +
        ui.iconButton('fa-chevron-left', 'Previous month', { class: 'nm-iconbtn--sm', attrs: ' data-mini-prev' }) +
        '<p class="nm-minical-label">' + esc(U.fmtMonthYear(anchor)) + '</p>' +
        ui.iconButton('fa-chevron-right', 'Next month', { class: 'nm-iconbtn--sm', attrs: ' data-mini-next' }) +
      '</div>' +
      '<div class="nm-minical-grid nm-minical-grid--names" aria-hidden="true">' +
        U.WEEKDAY_LABELS.map(function (d) { return '<span class="nm-mono">' + d.charAt(0) + '</span>'; }).join('') +
      '</div>' +
      '<div class="nm-minical-grid">' + cells.map(function (day) {
        var items = N.store.eventsOnDay(day);
        var classes = ['nm-minical-day'];
        if (day.getMonth() !== month) classes.push('is-other');
        if (U.isSameDay(day, today)) classes.push('is-today');
        if (selectedDay && U.isSameDay(day, selectedDay)) classes.push('is-selected');
        return '<button type="button" class="' + classes.join(' ') + '" data-mini-day="' + esc(U.dayKey(day)) + '" aria-label="' +
          esc(U.fmtDayLong(day) + ' — ' + items.length + ' item' + (items.length === 1 ? '' : 's')) + '"' +
          (selectedDay && U.isSameDay(day, selectedDay) ? ' aria-pressed="true"' : '') + '>' +
          '<span class="nm-mono nm-minical-num">' + day.getDate() + '</span>' +
          '<span class="nm-minical-dots">' + items.slice(0, 3).map(function (it) {
            return '<i class="nm-minical-dot nm-mk-' + esc(it.color) + (it.done ? ' is-done' : '') + '"></i>';
          }).join('') + '</span>' +
          '</button>';
      }).join('') + '</div>' +
      '<p class="nm-minical-foot"><a class="nm-link" href="#/calendar">Open the calendar ' + ui.icon('fa-arrow-right') + '</a></p>' +
      '</div>';
  }

  function upRow(item) {
    var group = N.store.groupById(item.groupId);
    return '<li class="nm-uprow" data-up-item="' + esc(item.id) + '" tabindex="0">' +
      '<span class="nm-uprow-when nm-mono">' + esc(U.fmtTime(item.start)) + '</span>' +
      '<span class="nm-uprow-bd">' +
        '<span class="nm-task-title"><span class="nm-task-text">' + esc(item.title) + '</span></span>' +
        '<small class="nm-meta">' + esc(label(item)) + (group ? ' · ' + esc(group.subject || group.name) : '') + '</small>' +
      '</span>' +
      (item.kind === 'event' && item.location ? '<span class="nm-chip nm-chip--sm nm-chip--muted">' + esc(U.truncate(item.location, 16)) + '</span>' : '') +
      ui.dial(item.start, !!item.done, { showLabel: false }) +
      '</li>';
  }

  /* ---------- agenda: a chosen day, or the next seven ---------- */
  function agenda() {
    var now = new Date();

    if (selectedDay) {
      var dayItems = N.store.eventsOnDay(selectedDay);
      return '<div class="nm-agenda-head">' +
          '<h2 class="nm-card-title">' + esc(U.fmtDayLong(selectedDay)) + '</h2>' +
          '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-clear-day>Show the week</button>' +
        '</div>' +
        (dayItems.length
          ? '<ul class="nm-uplist">' + dayItems.map(upRow).join('') + '</ul>'
          : ui.empty({ compact: true, icon: 'fa-calendar-day', title: 'Nothing on this day', body: 'A clear day — add an event from the calendar if you need one.' }));
    }

    /* Coming up is the calendar lens: events only — tasks live in the to-do module. */
    var horizon = U.addDays(now, 7);
    var items = N.store.allEvents().filter(function (e) {
      var at = new Date(e.start);
      return e.kind === 'event' && at >= U.startOfDay(now) && at <= horizon;
    }).slice(0, 8);

    return '<div class="nm-agenda-head"><h2 class="nm-card-title">Coming up</h2>' +
        '<span class="nm-mono nm-meta">next 7 days</span></div>' +
      (items.length
        ? '<ul class="nm-uplist">' + items.map(function (it, i) {
            var dayLabel = U.isSameDay(new Date(it.start), now) ? 'Today' : U.fmtDay(it.start);
            var prev = i > 0 ? items[i - 1] : null;
            var sameDay = prev && U.isSameDay(new Date(prev.start), new Date(it.start));
            return (sameDay ? '' : '<li class="nm-uplist-day nm-mono">' + esc(dayLabel) + '</li>') + upRow(it);
          }).join('') + '</ul>'
        : ui.empty({ compact: true, icon: 'fa-calendar-day', title: 'Nothing in the next week', body: 'Deadlines, exams and study blocks land here.' }));
  }

  /* ---------- my to-do ---------- */
  function todoModule() {
    var mine = N.store.personalTasks();
    var open = mine.filter(function (t) { return t.status !== 'done'; });
    var overdue = open.filter(function (t) { return t.dueAt && U.daysUntil(t.dueAt) < 0; });
    var today = open.filter(function (t) { return t.dueAt && U.daysUntil(t.dueAt) === 0; });
    var soon = U.sortBy(open.filter(function (t) {
      return t.dueAt && U.daysUntil(t.dueAt) > 0 && U.daysUntil(t.dueAt) <= 7;
    }), function (t) { return t.dueAt; }).slice(0, 3);
    var noDate = open.filter(function (t) { return !t.dueAt; }).slice(0, 2);
    var shown = overdue.concat(today, soon, noDate).slice(0, 6);
    var groupDue = U.sortBy(N.store.state.tasks.filter(function (t) {
      return t.groupId && t.status !== 'done' && t.dueAt && U.daysUntil(t.dueAt) <= 7;
    }), function (t) { return t.dueAt; }).slice(0, 3);

    return N.pages.todoComposer({ placeholder: 'Add something to your list…' }) +
      (shown.length
        ? '<ul class="nm-tasklist">' + shown.map(function (t) {
            return ui.taskRow(t, { menu: 'data-home-todo-menu', dial: true, timeOnly: t.dueAt ? U.daysUntil(t.dueAt) <= 0 : false });
          }).join('') + '</ul>'
        : ui.empty({ compact: true, icon: 'fa-list-check', title: 'Your list is clear', body: 'Add today’s three things above.' })) +
      (groupDue.length
        ? '<div class="nm-todo-groupdue"><p class="nm-side-note nm-mono">From your groups</p>' +
          '<ul class="nm-tasklist nm-tasklist--compact">' + groupDue.map(function (t) {
            return ui.taskRow(t, { dial: true, timeOnly: false });
          }).join('') + '</ul></div>'
        : '');
  }

  /* ---------- groups ---------- */
  function groups() {
    var list = N.store.state.groups;
    if (!list.length) {
      return ui.empty({
        icon: 'fa-users', title: 'No groups yet',
        body: 'Group projects live here: shared tasks, shared notes, one deadline list.',
        actionLabel: 'Create a group'
      });
    }
    return '<div class="nm-pulse-grid">' + list.map(function (g) {
      var isStudy = g.kind === 'study';
      var stats = N.store.groupStats(g.id);
      var study = isStudy ? N.store.studyStats(g.id) : null;
      var members = N.store.membersOf(g.id);
      var line = isStudy
        ? (study.notes + ' shared note' + (study.notes === 1 ? '' : 's')) +
          (study.nextSession ? ' · session <span class="nm-mono">' + esc(U.fmtRelative(study.nextSession.start)) + '</span>' : '') +
          (study.openRequests ? ' · ' + study.openRequests + ' request' + (study.openRequests === 1 ? '' : 's') + ' waiting' : '')
        : (stats.next
            ? 'Next: ' + esc(U.truncate(stats.next.title, 40)) + ' <span class="nm-mono">' + esc(U.fmtRelative(stats.next.dueAt)) + '</span>'
            : 'No open tasks');
      return '<a class="nm-pulse nm-mk-' + esc(g.color) + '" href="#/groups/' + esc(g.id) + '">' +
        '<div class="nm-pulse-top">' +
          '<span class="nm-chip nm-chip--sm nm-chip--muted">' + ui.icon(isStudy ? 'fa-note-sticky' : 'fa-list-check') + (isStudy ? 'Study' : 'Project') + '</span>' +
          (g.subject ? ui.markerChip(g.subject, g.color, { small: true }) : '') +
          (isStudy
            ? (study.openRequests ? '<span class="nm-chip nm-chip--sm nm-chip--warn">' + ui.icon('fa-circle-question') + study.openRequests + ' waiting</span>' : '')
            : (stats.overdue ? '<span class="nm-chip nm-chip--sm nm-chip--danger">' + ui.icon('fa-circle-exclamation') + stats.overdue + ' overdue</span>' : '')) +
        '</div>' +
        '<h3 class="nm-pulse-title">' + esc(g.name) + '</h3>' +
        '<p class="nm-pulse-next">' + line + '</p>' +
        '<div class="nm-pulse-ft">' +
          (isStudy
            ? (study.topics.length
                ? study.topics.slice(0, 3).map(function (t) { return ui.markerChip(t.name, t.color, { small: true }); }).join('')
                : '<span class="nm-mono nm-meta">no topics yet</span>')
            : ui.progress(stats.pct, { marker: g.color, label: g.name + ' progress' }) +
              '<span class="nm-mono nm-pulse-pct">' + stats.pct + '%</span>') +
          ui.avatarStack(members, 4) +
        '</div></a>';
    }).join('') + '</div>';
  }

  /* ---------- render ---------- */
  function render(ctx, root) {
    var stats = N.store.stats();
    var me = N.store.me();

    root.innerHTML = '<div class="nm-page nm-page--home">' +
      ui.pageHead({
        eyebrow: 'Home · <span class="nm-mono">' + esc(U.fmtDayLong(new Date())) + '</span>',
        title: greeting() + ', ' + esc((me ? me.name : 'there').split(' ')[0]),
        meta: '<span class="nm-mono">' + stats.dueThisWeek + ' due this week</span> · <span class="nm-mono">' + stats.openTasks + ' open</span>' +
          (stats.overdue ? ' · <span class="nm-chip nm-chip--sm nm-chip--danger">' + ui.icon('fa-circle-exclamation') + stats.overdue + ' overdue</span>' : ''),
        actions: '<button type="button" class="nm-btn nm-btn--secondary" data-new-group>' + ui.icon('fa-users') + 'New group</button>' +
          '<button type="button" class="nm-btn nm-btn--primary" data-new-task>' + ui.icon('fa-plus') + 'New task</button>'
      }) +
      '<div class="nm-home-panel">' +
        miniCalendar() +
        '<div class="nm-home-agenda">' + agenda() + '</div>' +
      '</div>' +
      ui.section('My to-do', todoModule(), { actions: '<a class="nm-link" href="#/tasks">All tasks ' + ui.icon('fa-arrow-right') + '</a>' }) +
      ui.section('Your groups', groups(), { actions: '<a class="nm-link" href="#/groups">All groups ' + ui.icon('fa-arrow-right') + '</a>' }) +
      '</div>';

    /* month navigation + day selection */
    U.delegate(root, '[data-mini-prev]', 'click', function () {
      anchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-mini-next]', 'click', function () {
      anchor = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-mini-day]', 'click', function (e, btn) {
      var parts = btn.getAttribute('data-mini-day').split('-').map(Number);
      var day = new Date(parts[0], parts[1] - 1, parts[2]);
      selectedDay = selectedDay && U.isSameDay(day, selectedDay) ? null : day;
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-clear-day]', 'click', function () {
      selectedDay = null;
      N.router.render({ keepScroll: true, keepFocus: true });
    });

    /* actions */
    U.delegate(root, '[data-new-group]', 'click', function () { N.pages.newGroupModal(); });
    U.delegate(root, '[data-new-task]', 'click', function () { N.taskModal.open({}); });
    U.delegate(root, '[data-empty-action]', 'click', function () { N.pages.newGroupModal(); });

    /* agenda rows */
    function activateUp(el) {
      var wrap = el.closest('[data-up-item]');
      if (wrap) openItem(wrap.getAttribute('data-up-item'));
    }
    U.delegate(root, '[data-up-item]', 'click', function (e, el) { activateUp(el); });
    U.delegate(root, '[data-up-item]', 'keydown', function (e, el) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateUp(el); }
    });

    /* task rows */
    U.delegate(root, '[data-task-toggle]', 'click', function (e, btn) {
      e.stopPropagation();
      var task = N.store.taskById(btn.getAttribute('data-task-toggle'));
      if (!task) return;
      var was = task.status;
      var next = was === 'done' ? 'doing' : 'done';
      N.store.updateTask(task.id, { status: next }, { quiet: true });
      if (next === 'done') {
        ui.toast('“' + U.truncate(task.title, 30) + '” done', {
          kind: 'success', icon: 'fa-check', actionLabel: 'Undo',
          onAction: function () { N.store.updateTask(task.id, { status: was }, { quiet: true }); }
        });
      }
    });
    U.delegate(root, '[data-task]', 'click', function (e, row) {
      if (e.target.closest('[data-task-toggle]')) return;
      var task = N.store.taskById(row.getAttribute('data-task'));
      if (task) N.taskModal.open({ task: task });
    });

    /* to-do composer + row menu */
    N.pages.bindTodoComposer(root, function () { N.router.render({ keepScroll: true, keepFocus: true }); });
    U.delegate(root, '[data-home-todo-menu]', 'click', function (e, btn) {
      e.stopPropagation();
      var task = N.store.taskById(btn.getAttribute('data-home-todo-menu'));
      if (!task) return;
      ui.menu(btn, [
        { label: 'Open in my to-do', icon: 'fa-list-check', onClick: function () { N.router.go('/tasks'); } },
        { label: 'Edit', icon: 'fa-pen', onClick: function () { N.taskModal.open({ task: task }); } },
        { label: 'Postpone to tomorrow', icon: 'fa-calendar-plus', onClick: function () {
          N.store.postponeTask(task.id);
          ui.toast('Moved to tomorrow', { kind: 'success', icon: 'fa-calendar-plus' });
        } },
        { sep: true },
        { label: 'Delete', icon: 'fa-trash', danger: true, onClick: function () {
          ui.confirm({ title: 'Delete “' + task.title + '”?', message: 'It disappears from your list, the calendar and reminders.', confirmLabel: 'Delete', variant: 'danger' })
            .then(function (ok) { if (ok) { N.store.deleteTask(task.id); ui.toast('Deleted', { kind: 'info' }); } });
        } }
      ]);
    });
  }

  N.router.add('/today', render, { title: function () { return 'Home'; }, grid: true });
})();
