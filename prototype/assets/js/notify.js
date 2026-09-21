/* Neoma — derived notifications (deadlines, assignments, exams, shared notes). */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util;
  var H = U.MS.hour, D = U.MS.day;

  var GROUPS = ['overdue', 'due', 'sessions', 'assigned', 'exams', 'notes'];
  var GROUP_LABEL = { overdue: 'Overdue', due: 'Due soon', sessions: 'Study sessions', assigned: 'Assigned to you', exams: 'Exams', notes: 'Shared with you' };
  var GROUP_ICON = { overdue: 'fa-circle-exclamation', due: 'fa-hourglass-half', sessions: 'fa-book-open-reader', assigned: 'fa-user-check', exams: 'fa-graduation-cap', notes: 'fa-note-sticky' };

  function taskRoute(t) {
    return t.groupId ? '#/groups/' + t.groupId + '?tab=tasks' : '#/today';
  }

  var notify = {
    GROUP_ORDER: GROUPS,
    groupLabel: function (k) { return GROUP_LABEL[k] || k; },
    groupIcon: function (k) { return GROUP_ICON[k] || 'fa-bell'; },

    derive: function (now) {
      var s = N.store;
      var state = s.state;
      var n = now || new Date();
      var kinds = state.settings.kinds || {};
      var lead = state.settings.leadTimeHours || 48;
      var me = state.session.userId;
      var out = [];

      if (kinds.overdue !== false) {
        s.overdueTasks(n).forEach(function (t) {
          var g = s.groupById(t.groupId);
          out.push({
            id: 'overdue:' + t.id, group: 'overdue', priority: 0, at: t.dueAt,
            title: t.title, body: 'Overdue · ' + U.fmtDateTime(t.dueAt) + (g ? ' · ' + g.name : ''),
            route: taskRoute(t), icon: 'fa-circle-exclamation', tone: 'danger'
          });
        });
      }

      if (kinds.dueSoon !== false) {
        var soonMs = n.getTime() + lead * H;
        state.tasks.forEach(function (t) {
          if (t.status === 'done' || !t.dueAt) return;
          var due = new Date(t.dueAt).getTime();
          if (due < n.getTime() || due > soonMs) return;
          var g = s.groupById(t.groupId);
          var hours = Math.max(1, Math.round((due - n.getTime()) / H));
          out.push({
            id: 'due:' + t.id + ':' + lead, group: 'due', priority: 1, at: t.dueAt,
            title: t.title,
            body: (hours <= 24 ? 'Due today · ' + U.fmtTime(t.dueAt) : 'Due ' + U.fmtRelative(t.dueAt, n)) + (g ? ' · ' + g.name : ''),
            route: taskRoute(t), icon: 'fa-hourglass-half', tone: hours <= 24 ? 'today' : 'muted'
          });
        });
      }

      if (kinds.sessions !== false) {
        state.events.forEach(function (e) {
          if (e.type !== 'session' || !e.groupId) return;
          var hours = (new Date(e.start) - n) / H;
          if (hours < 0 || hours > lead) return;   /* same lead time as deadlines */
          var urgent = hours <= 1;
          var g = s.groupById(e.groupId);
          out.push({
            id: 'session:' + e.id + ':' + (urgent ? '1h' : 'lead'),
            group: 'sessions', priority: urgent ? 0 : 1, at: e.start,
            title: e.title,
            body: (urgent ? 'Starts in under an hour' : (U.isSameDay(new Date(e.start), n) ? 'Today at ' : 'Tomorrow at ') + U.fmtTime(e.start)) +
              (g ? ' · ' + g.name : ''),
            route: '#/calendar', icon: 'fa-book-open-reader', tone: urgent ? 'today' : 'muted'
          });
        });
      }

      if (kinds.assigned !== false) {
        state.tasks.forEach(function (t) {
          if (t.status === 'done' || t.assigneeIds.indexOf(me) === -1) return;
          if (t.createdBy === me) return;
          var g = s.groupById(t.groupId);
          out.push({
            id: 'assigned:' + t.id + ':' + me, group: 'assigned', priority: 2, at: t.createdAt,
            title: t.title, body: s.userName(t.createdBy) + ' put this on you' + (g ? ' · ' + g.name : '') +
              (t.dueAt ? ' · due ' + U.fmtRelative(t.dueAt, n) : ''),
            route: taskRoute(t), icon: 'fa-user-check', tone: 'muted'
          });
        });
      }


      if (kinds.exams !== false) {
        state.events.forEach(function (e) {
          if (e.type !== 'exam') return;
          var days = U.daysUntil(e.start, n);
          if (days < 0 || days > 7) return;
          if ([7, 3, 2, 1, 0].indexOf(days) === -1) return;
          out.push({
            id: 'exam:' + e.id + ':' + days, group: 'exams', priority: days <= 1 ? 0 : 2, at: e.start,
            title: e.title, body: days === 0 ? 'Today · ' + U.fmtTime(e.start) : 'In ' + days + ' day' + (days === 1 ? '' : 's') + ' · ' + U.fmtTime(e.start),
            route: '#/calendar', icon: 'fa-graduation-cap', tone: days <= 1 ? 'danger' : 'muted'
          });
        });
      }

      if (kinds.notes !== false) {
        var cutoff = n.getTime() - 14 * D;
        state.notes.forEach(function (note) {
          if (note.scope !== 'group') return;
          if (note.createdBy === me) return;
          if (new Date(note.createdAt).getTime() < cutoff) return;
          var g = s.groupById(note.groupId);
          out.push({
            id: 'note:' + note.id, group: 'notes', priority: 4, at: note.createdAt,
            title: note.title, body: s.userName(note.createdBy) + ' shared a note' + (g ? ' · ' + g.name : ''),
            route: '#/groups/' + note.groupId + '?tab=notes', icon: 'fa-note-sticky', tone: 'muted'
          });
        });
      }

      var snoozed = state.notifications.snoozed || {};
      out = out.filter(function (item) {
        var until = snoozed[item.id];
        return !until || new Date(until) <= n;
      });

      return U.sortBy(out, function (i) { return i.priority * 10000000000000 + new Date(i.at).getTime(); });
    },

    isRead: function (item) {
      return !!N.store.state.notifications.read[item.id];
    },
    unread: function (now) {
      return notify.derive(now).filter(function (i) { return !notify.isRead(i); });
    },
    countByGroup: function (list) {
      var map = {};
      list.forEach(function (i) { map[i.group] = (map[i.group] || 0) + 1; });
      return map;
    },

    /* Watch while the tab is open; toast + optional system notification for new items. */
    watch: function () {
      var firstRun = true;
      function tick() {
        var items = notify.derive();
        var seen = N.store.state.notifications.seen || {};
        var fresh = items.filter(function (i) { return !seen[i.id] && !N.store.state.notifications.read[i.id]; });
        if (firstRun) {
          N.store.markSeen(items.map(function (i) { return i.id; }));
          firstRun = false;
          U.bus.emit('notify-change');
          return;
        }
        if (fresh.length) {
          N.store.markSeen(fresh.map(function (i) { return i.id; }));
          fresh.slice(0, 3).forEach(function (item) {
            if (N.ui && N.ui.toast) {
              N.ui.toast(item.title, { body: item.body, kind: item.tone === 'danger' ? 'danger' : 'info', icon: item.icon, route: item.route });
            }
          });
          if (N.store.state.settings.browserNotifications && window.Notification && Notification.permission === 'granted') {
            fresh.slice(0, 2).forEach(function (item) {
              try { new Notification('Neoma · ' + item.title, { body: item.body }); } catch (e) { /* ignore */ }
            });
          }
        }
        U.bus.emit('notify-change');
      }
      tick();
      setInterval(tick, 60000);
      U.bus.on('change', U.debounce(function () { U.bus.emit('notify-change'); }, 120));
    }
  };

  N.notify = notify;
})();
