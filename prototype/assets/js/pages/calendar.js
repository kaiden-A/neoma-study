/* Neoma — calendar: month + week views, deadlines, exams, Google Calendar hand-off. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  N.pages = N.pages || {};

  var view = { anchor: new Date(), mode: 'month', filters: { task: true, exam: true, session: true, meeting: true, personal: true } };

  function passes(item) {
    if (item.kind === 'task') return view.filters.task;
    return view.filters[item.type] !== false;
  }
  function itemsForDay(day) {
    return N.store.eventsOnDay(day).filter(passes);
  }
  function itemLabel(item) {
    return item.kind === 'task' ? 'Task' : ui.eventType(item.type).label;
  }

  /* ---------- event modal ---------- */
  N.pages.eventModal = function (opts) {
    opts = opts || {};
    var editing = opts.event || null;
    var defaults = opts.defaults || {};
    var startDefault = defaults.start ? new Date(defaults.start) : new Date(Date.now() + U.MS.hour);
    var e = editing || {
      id: null, title: '', type: defaults.type || 'session',
      start: startDefault.toISOString(), end: new Date(startDefault.getTime() + U.MS.hour).toISOString(),
      groupId: defaults.groupId || null, location: '', reminderMinutes: 60, notes: ''
    };
    var groups = N.store.state.groups;

    ui.modal({
      title: editing ? 'Edit event' : 'New event',
      subtitle: 'Events and reminders live alongside your group deadlines.',
      size: 'md',
      body: '<div class="nm-form">' +
        ui.field({ label: 'Title', id: 'ev-title', value: e.title, placeholder: 'e.g. Physics revision block', required: true, class: 'nm-field--full' }) +
        '<div class="nm-form-grid">' +
          ui.field({ label: 'Type', id: 'ev-type', type: 'select', value: e.type, options: N.store.EVENT_TYPES.map(function (t) { return { value: t, label: N.store.EVENT_TYPE_LABEL[t] }; }) }) +
          ui.field({ label: 'Group (optional)', id: 'ev-group', type: 'select', value: e.groupId || '', options: [{ value: '', label: 'No group' }].concat(groups.map(function (g) { return { value: g.id, label: g.name }; })) }) +
          ui.field({ label: 'Starts', id: 'ev-start', type: 'datetime-local', value: U.toInputValue(e.start) }) +
          ui.field({ label: 'Ends', id: 'ev-end', type: 'datetime-local', value: U.toInputValue(e.end) }) +
          ui.field({ label: 'Location', id: 'ev-location', value: e.location, placeholder: 'Room, hall, link…' }) +
          ui.field({
            label: 'Reminder', id: 'ev-reminder', type: 'select', value: String(e.reminderMinutes),
            options: [
              { value: '0', label: 'No reminder' }, { value: '15', label: '15 minutes before' },
              { value: '60', label: '1 hour before' }, { value: '1440', label: '1 day before' },
              { value: '2880', label: '2 days before' }, { value: '10080', label: '1 week before' }
            ]
          }) +
        '</div>' +
        ui.field({ label: 'Notes', id: 'ev-notes', type: 'textarea', rows: 2, value: e.notes, placeholder: 'What to bring, what to cover…', class: 'nm-field--full' }) +
      '</div>',
      footerHtml: (editing
        ? '<button type="button" class="nm-btn nm-btn--danger nm-btn--ghost" data-delete>Delete</button>' +
          '<button type="button" class="nm-btn nm-btn--ghost" data-ics>' + ui.icon('fa-file-arrow-down') + 'Download .ics</button>' +
          '<button type="button" class="nm-btn nm-btn--ghost" data-gcal>' + ui.icon('fa-calendar-plus') + 'Add to Google</button>'
        : '') +
        '<span class="nm-spacer"></span>' +
        '<button type="button" class="nm-btn nm-btn--ghost" data-cancel>Cancel</button>' +
        '<button type="button" class="nm-btn nm-btn--primary" data-save>' + (editing ? 'Save event' : 'Add to calendar') + '</button>',
      onMount: function (panel, close) {
        panel.querySelector('#ev-title').focus();
        panel.querySelector('[data-cancel]').addEventListener('click', close);
        panel.querySelector('[data-save]').addEventListener('click', function () {
          var title = panel.querySelector('#ev-title');
          if (!title.value.trim()) {
            var field = title.closest('.nm-field');
            field.classList.add('has-error');
            var err = field.querySelector('[data-error-for]');
            err.textContent = 'Give the event a title.';
            err.hidden = false;
            title.focus();
            return;
          }
          var payload = {
            title: title.value.trim(),
            type: panel.querySelector('#ev-type').value,
            groupId: panel.querySelector('#ev-group').value || null,
            start: U.fromInputValue(panel.querySelector('#ev-start').value).toISOString(),
            end: panel.querySelector('#ev-end').value ? U.fromInputValue(panel.querySelector('#ev-end').value).toISOString() : null,
            location: panel.querySelector('#ev-location').value.trim(),
            reminderMinutes: Number(panel.querySelector('#ev-reminder').value),
            notes: panel.querySelector('#ev-notes').value.trim()
          };
          if (editing) {
            N.store.updateEvent(e.id, payload);
            ui.toast('Event updated', { kind: 'success' });
          } else {
            N.store.createEvent(payload);
            ui.toast('Added to the calendar', { kind: 'success', icon: 'fa-calendar-plus' });
          }
          close();
        });
        var del = panel.querySelector('[data-delete]');
        if (del) del.addEventListener('click', function () {
          ui.confirm({ title: 'Delete “' + e.title + '”?', message: 'It disappears from the calendar and reminders stop.', confirmLabel: 'Delete event', variant: 'danger' })
            .then(function (ok) { if (ok) { N.store.deleteEvent(e.id); close(); ui.toast('Event deleted', { kind: 'info' }); } });
        });
        function currentPayload() {
          var g = N.store.groupById(panel.querySelector('#ev-group').value);
          return {
            id: e.id || 'draft', title: panel.querySelector('#ev-title').value || 'Untitled',
            start: U.fromInputValue(panel.querySelector('#ev-start').value).toISOString(),
            end: panel.querySelector('#ev-end').value ? U.fromInputValue(panel.querySelector('#ev-end').value).toISOString() : null,
            location: panel.querySelector('#ev-location').value.trim(),
            reminderMinutes: Number(panel.querySelector('#ev-reminder').value),
            groupName: g ? g.name : ''
          };
        }
        var icsBtn = panel.querySelector('[data-ics]');
        if (icsBtn) icsBtn.addEventListener('click', function () {
          N.ics.downloadEvent(currentPayload());
          ui.toast('.ics downloaded', { kind: 'success', body: 'Open it to add the event to any calendar app.' });
        });
        var gcalBtn = panel.querySelector('[data-gcal]');
        if (gcalBtn) gcalBtn.addEventListener('click', function () {
          window.open(N.ics.googleUrl(currentPayload()), '_blank', 'noopener');
          var s = N.store.state.settings;
          if (s.google.status !== 'connected') {
            ui.toast('Tip: connect Google Calendar', { kind: 'info', body: 'Settings → Integrations stores your sync preferences.', route: '#/settings' });
          }
        });
      }
    });
  };

  function openDay(day) {
    var items = itemsForDay(day);
    ui.modal({
      title: U.fmtDayLong(day),
      subtitle: items.length + ' item' + (items.length === 1 ? '' : 's') + ' on this day',
      size: 'md',
      body: items.length
        ? '<ul class="nm-daylist">' + items.map(function (it) {
            var g = N.store.groupById(it.groupId);
            return '<li class="nm-dayrow nm-mk-' + esc(it.color) + '">' +
              '<span class="nm-dayrow-time nm-mono">' + esc(U.fmtTime(it.start)) + '</span>' +
              '<div class="nm-dayrow-bd"><p class="nm-task-title"><span class="nm-task-text">' + esc(it.title) + '</span>' +
                (it.kind === 'task' && it.done ? ui.statusChip('done') : '') + '</p>' +
                '<p class="nm-meta">' + ui.chip(itemLabel(it), { small: true, icon: it.kind === 'task' ? 'fa-list-check' : ui.eventType(it.type).icon }) +
                (g ? ' ' + ui.groupPill(g) : '') + (it.location ? ' ' + ui.chip(it.location, { small: true, icon: 'fa-location-dot' }) : '') + '</p></div>' +
              '<div class="nm-dayrow-actions">' +
                (it.kind === 'task'
                  ? '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-day-task="' + esc(it.refId) + '">Open task</button>' +
                    '<a class="nm-iconbtn nm-iconbtn--sm" aria-label="Add to Google Calendar" target="_blank" rel="noopener" href="' + esc(N.ics.googleUrl(it)) + '">' + ui.icon('fa-calendar-plus') + '</a>'
                  : '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-day-event="' + esc(it.refId) + '">Open</button>') +
              '</div></li>';
          }).join('') + '</ul>'
        : ui.empty({ compact: true, icon: 'fa-calendar-day', title: 'Nothing scheduled', body: 'A clear day. Add a revision block if you want one.' }),
      footerHtml: '<span class="nm-spacer"></span><button type="button" class="nm-btn nm-btn--primary" data-day-add>' + ui.icon('fa-plus') + 'Add event</button>',
      onMount: function (panel, close) {
        panel.querySelector('[data-day-add]').addEventListener('click', function () {
          close();
          var d = new Date(day);
          d.setHours(18, 0, 0, 0);
          N.pages.eventModal({ defaults: { start: d.toISOString() } });
        });
        U.delegate(panel, '[data-day-task]', 'click', function (evt, btn) {
          var t = N.store.taskById(btn.getAttribute('data-day-task'));
          if (t) { close(); N.taskModal.open({ task: t }); }
        });
        U.delegate(panel, '[data-day-event]', 'click', function (evt, btn) {
          var e = N.store.eventById(btn.getAttribute('data-day-event'));
          if (e) { close(); N.pages.eventModal({ event: e }); }
        });
      }
    });
  }

  /* ---------- views ---------- */
  function pill(item) {
    return '<button type="button" class="nm-cal-pill nm-mk-' + esc(item.color) + (item.done ? ' is-done' : '') + '" data-cal-item="' + esc(item.id) + '">' +
      '<span class="nm-dot"></span><span class="nm-cal-pill-text">' + esc(item.title) + '</span></button>';
  }

  function monthView() {
    var cells = U.monthGrid(view.anchor);
    var month = view.anchor.getMonth();
    var today = new Date();
    return '<div class="nm-cal-head">' + U.WEEKDAY_LABELS.map(function (d) { return '<span class="nm-cal-weekday nm-mono">' + d + '</span>'; }).join('') + '</div>' +
      '<div class="nm-cal-grid">' + cells.map(function (day) {
        var items = itemsForDay(day);
        var shown = items.slice(0, 3);
        var other = day.getMonth() !== month;
        return '<div class="nm-cal-cell' + (other ? ' is-other' : '') + (U.isSameDay(day, today) ? ' is-today' : '') + '" data-cal-day="' + esc(U.dayKey(day)) + '">' +
          '<div class="nm-cal-daytop"><span class="nm-cal-daynum nm-mono">' + day.getDate() + '</span>' +
            (items.length > shown.length ? '<button type="button" class="nm-cal-more nm-mono" data-cal-more="' + esc(U.dayKey(day)) + '">+' + (items.length - shown.length) + '</button>' : '') +
          '</div>' +
          '<div class="nm-cal-items">' + shown.map(pill).join('') + '</div></div>';
      }).join('') + '</div>';
  }

  function weekView() {
    var days = U.weekDays(view.anchor);
    var today = new Date();
    return '<div class="nm-cal-week">' + days.map(function (day) {
      var items = itemsForDay(day);
      return '<div class="nm-cal-wcol' + (U.isSameDay(day, today) ? ' is-today' : '') + '">' +
        '<button type="button" class="nm-cal-wcol-hd" data-cal-day="' + esc(U.dayKey(day)) + '">' +
          '<span class="nm-mono">' + esc(day.toLocaleDateString('en-GB', { weekday: 'short' })) + '</span>' +
          '<strong class="nm-mono">' + day.getDate() + '</strong></button>' +
        '<div class="nm-cal-wcol-bd">' + (items.length
          ? items.map(function (it) {
              return '<button type="button" class="nm-cal-weekcard nm-mk-' + esc(it.color) + (it.done ? ' is-done' : '') + '" data-cal-item="' + esc(it.id) + '">' +
                '<span class="nm-mono nm-cal-weekcard-time">' + esc(U.fmtTime(it.start)) + '</span>' +
                '<span class="nm-cal-weekcard-title">' + esc(it.title) + '</span>' +
                '<span class="nm-cal-weekcard-kind nm-mono">' + esc(itemLabel(it)) + '</span></button>';
            }).join('')
          : '<button type="button" class="nm-cal-wcol-add" data-cal-day="' + esc(U.dayKey(day)) + '" aria-label="Add event on ' + esc(U.fmtDay(day)) + '">' + ui.icon('fa-plus') + '</button>') +
        '</div></div>';
    }).join('') + '</div>';
  }

  function upcomingSidebar() {
    var now = new Date();
    var items = N.store.allEvents().filter(function (e) {
      return new Date(e.start) >= U.startOfDay(now) && passes(e);
    }).slice(0, 8);
    var s = N.store.state.settings;
    var googleTone = s.google.status === 'connected' ? 'nm-chip--ok' : 'nm-chip--muted';
    return ui.card(
      '<div class="nm-gcal">' +
        '<div class="nm-gcal-top"><span class="nm-gcal-logo">' + ui.icon('fa-brands fa-google') + '</span>' +
          '<div><p class="nm-gcal-status">Google Calendar</p>' +
          '<p class="nm-meta">' + (s.google.status === 'connected'
            ? 'Connected' + (s.google.lastSyncAt ? ' · synced ' + U.fmtRelative(s.google.lastSyncAt) : '') + (s.google.email ? ' · ' + esc(s.google.email) : '')
            : 'Not connected — deadlines stay in this browser only.') + '</p></div></div>' +
        '<div class="nm-gcal-actions">' +
          (s.google.status === 'connected'
            ? '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-gcal-sync>' + ui.icon('fa-rotate') + 'Sync now</button>'
            : '<button type="button" class="nm-btn nm-btn--primary nm-btn--sm" data-gcal-connect>' + ui.icon('fa-link') + 'Connect</button>') +
          '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-ics-export>' + ui.icon('fa-file-arrow-down') + 'Export .ics</button>' +
        '</div>' +
      '</div>', { title: 'Sync' }) +
      ui.card(items.length
        ? '<ul class="nm-upnext">' + items.map(function (it) {
            var g = N.store.groupById(it.groupId);
            return '<li class="nm-upnext-row' + (it.done ? ' is-done' : '') + '" data-cal-item="' + esc(it.id) + '">' +
              '<span class="nm-upnext-date nm-mono">' + esc(U.fmtDay(it.start)) + '<small>' + esc(U.fmtTime(it.start)) + '</small></span>' +
              '<span class="nm-upnext-bd"><span class="nm-task-text">' + esc(it.title) + '</span>' +
              '<small class="nm-meta">' + esc(itemLabel(it)) + (g ? ' · ' + esc(g.name) : '') + '</small></span>' +
              ui.dial(it.start, !!it.done, { showLabel: false }) + '</li>';
          }).join('') + '</ul>'
        : ui.empty({ compact: true, icon: 'fa-calendar-day', title: 'Nothing upcoming', body: 'Deadlines, exams and sessions all land here.' }),
        { title: 'Next up' });
  }

  /* ---------- render ---------- */
  function render(ctx, root) {
    var events = N.store.allEvents();
    var s = N.store.state.settings;
    var label = view.mode === 'month' ? U.fmtMonthYear(view.anchor)
      : U.fmtDay(U.weekDays(view.anchor)[0]) + ' – ' + U.fmtDay(U.weekDays(view.anchor)[6]);

    var filters = [
      { key: 'task', label: 'Group tasks', icon: 'fa-list-check', marker: 'sky' },
      { key: 'exam', label: 'Exams', icon: 'fa-graduation-cap', marker: 'coral' },
      { key: 'session', label: 'Study sessions', icon: 'fa-book-open-reader', marker: 'violet' },
      { key: 'meeting', label: 'Meetings', icon: 'fa-people-group', marker: 'sky' },
      { key: 'personal', label: 'Personal', icon: 'fa-mug-hot', marker: 'amber' }
    ];

    root.innerHTML = '<div class="nm-page nm-page--cal">' +
      ui.pageHead({
        eyebrow: 'Calendar · <span class="nm-mono">' + events.length + ' items tracked</span>',
        title: 'Everything with a date',
        meta: s.google.status === 'connected'
          ? 'Group deadlines, exams and study blocks, mirrored to Google Calendar.'
          : 'Group deadlines, exams and study blocks in one grid. Connect Google Calendar to take it with you.',
        actions: '<button type="button" class="nm-btn nm-btn--secondary" data-ics-export>' + ui.icon('fa-file-arrow-down') + 'Export .ics</button>' +
          '<button type="button" class="nm-btn nm-btn--primary" data-add-event>' + ui.icon('fa-plus') + 'Add event</button>'
      }) +
      '<div class="nm-cal-layout">' +
        '<div class="nm-cal-main">' +
          '<div class="nm-toolbar nm-cal-toolbar">' +
            '<div class="nm-cal-nav">' +
              '<button type="button" class="nm-iconbtn" data-cal-prev aria-label="Previous">' + ui.icon('fa-chevron-left') + '</button>' +
              '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-cal-today>Today</button>' +
              '<button type="button" class="nm-iconbtn" data-cal-next aria-label="Next">' + ui.icon('fa-chevron-right') + '</button>' +
            '</div>' +
            '<h2 class="nm-cal-label">' + esc(label) + '</h2>' +
            '<span class="nm-toolbar-spacer"></span>' +
            '<div class="nm-seg" role="tablist" aria-label="Calendar view">' +
              '<button type="button" role="tab" class="nm-seg-btn' + (view.mode === 'month' ? ' is-active' : '') + '" data-cal-mode="month">Month</button>' +
              '<button type="button" role="tab" class="nm-seg-btn' + (view.mode === 'week' ? ' is-active' : '') + '" data-cal-mode="week">Week</button>' +
            '</div>' +
          '</div>' +
          '<div class="nm-cal-filters">' + filters.map(function (f) {
            return '<button type="button" class="nm-chip nm-chip--sm nm-chip--link nm-mk-' + f.marker + (view.filters[f.key] ? ' is-active' : '') + '" data-cal-filter="' + f.key + '">' +
              ui.icon(f.icon) + esc(f.label) + '</button>';
          }).join('') + '</div>' +
          (view.mode === 'month' ? monthView() : weekView()) +
        '</div>' +
        '<aside class="nm-cal-side">' + upcomingSidebar() + '</aside>' +
      '</div></div>';

    function openItem(id) {
      if (id.indexOf('task:') === 0) {
        var t = N.store.taskById(id.slice(5));
        if (t) N.taskModal.open({ task: t });
      } else if (id.indexOf('event:') === 0) {
        var e = N.store.eventById(id.slice(6));
        if (e) N.pages.eventModal({ event: e });
      }
    }

    U.delegate(root, '[data-cal-item]', 'click', function (e, el) { openItem(el.getAttribute('data-cal-item')); });
    U.delegate(root, '.nm-upnext-row', 'click', function (e, el) { openItem(el.getAttribute('data-cal-item')); });
    U.delegate(root, '[data-cal-day]', 'click', function (e, el) {
      var key = el.getAttribute('data-cal-day');
      var parts = key.split('-').map(Number);
      openDay(new Date(parts[0], parts[1] - 1, parts[2]));
    });
    U.delegate(root, '[data-cal-more]', 'click', function (e, el) {
      e.stopPropagation();
      var parts = el.getAttribute('data-cal-more').split('-').map(Number);
      openDay(new Date(parts[0], parts[1] - 1, parts[2]));
    });
    U.delegate(root, '[data-cal-mode]', 'click', function (e, el) {
      view.mode = el.getAttribute('data-cal-mode');
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-cal-prev]', 'click', function () {
      view.anchor = view.mode === 'month' ? new Date(view.anchor.getFullYear(), view.anchor.getMonth() - 1, 1) : U.addDays(view.anchor, -7);
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-cal-next]', 'click', function () {
      view.anchor = view.mode === 'month' ? new Date(view.anchor.getFullYear(), view.anchor.getMonth() + 1, 1) : U.addDays(view.anchor, 7);
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-cal-today]', 'click', function () {
      view.anchor = new Date();
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-cal-filter]', 'click', function (e, el) {
      var key = el.getAttribute('data-cal-filter');
      view.filters[key] = !view.filters[key];
      N.router.render({ keepScroll: true, keepFocus: true });
    });
    U.delegate(root, '[data-add-event]', 'click', function () { N.pages.eventModal({}); });
    U.delegate(root, '[data-ics-export]', 'click', function () {
      var count = N.ics.downloadAll('neoma-study.ics');
      ui.toast(count ? count + ' events exported' : 'Nothing to export yet', {
        kind: count ? 'success' : 'danger', icon: 'fa-file-arrow-down',
        body: count ? 'Import the .ics in Google Calendar → Settings → Import.' : ''
      });
    });
    U.delegate(root, '[data-gcal-connect]', 'click', function () { N.pages.googleConnect(); });
    U.delegate(root, '[data-gcal-sync]', 'click', function () { N.pages.googleSync(); });
  }

  N.router.add('/calendar', render, { title: function () { return 'Calendar'; }, grid: true });
})();
