/* Neoma — application state: localStorage persistence, actions, selectors. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util;
  var D = U.MS.day, H = U.MS.hour;
  var KEY = 'neoma.v1.state';

  var state = null;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  var store = {
    get state() { return state; },

    init: function () {
      var saved = U.storage.get(KEY, null);
      if (saved && saved.version === 1 && Array.isArray(saved.users)) {
        state = saved;
        if (store.normalise()) store.save();
      } else {
        state = N.seed.build();
        store.save();
      }
      return state;
    },

    /* Additive fields arrive with new features; older saves get topped up here. */
    normalise: function () {
      var changed = false;
      state.groups.forEach(function (g) {
        if (g.kind !== 'project' && g.kind !== 'study') { g.kind = 'project'; changed = true; }
        if (!Array.isArray(g.topics)) { g.topics = []; changed = true; }
      });
      state.notes.forEach(function (n) {
        if (n.topicId === undefined) { n.topicId = null; changed = true; }
      });
      if (!state.settings.kinds || state.settings.kinds.sessions === undefined) {
        state.settings.kinds = Object.assign({ sessions: true }, state.settings.kinds || {});
        changed = true;
      }
      return changed;
    },

    save: function () {
      /* Synchronous on purpose: the whole state is a small JSON document and a
         prototype should never lose the last keystroke to a pending timer. */
      U.storage.set(KEY, state);
    },

    touch: function () {
      store.save();
      U.bus.emit('change', state);
      return state;
    },

    on: function (fn) { return U.bus.on('change', fn); },

    /* ---------- lookups ---------- */
    me: function () { return store.userById(state.session.userId); },
    userById: function (id) { return U.byId(state.users, id); },
    groupById: function (id) { return U.byId(state.groups, id); },
    folderById: function (id) { return U.byId(state.folders, id); },
    taskById: function (id) { return U.byId(state.tasks, id); },
    noteById: function (id) { return U.byId(state.notes, id); },
    eventById: function (id) { return U.byId(state.events, id); },
    membersOf: function (groupId) {
      var g = store.groupById(groupId);
      if (!g) return [];
      return g.memberIds.map(function (id) { return store.userById(id); }).filter(Boolean);
    },
    userName: function (id) {
      var u = store.userById(id);
      return u ? u.name : 'Someone';
    },
    isMember: function (groupId, userId) {
      var g = store.groupById(groupId);
      return !!(g && g.memberIds.indexOf(userId || state.session.userId) !== -1);
    },

    /* ---------- groups ---------- */
    KIND: ['project', 'study'],
    KIND_LABEL: { project: 'Project group', study: 'Study group' },
    topicsFromNames: function (names) {
      return (names || []).filter(Boolean).map(function (name, i) {
        return { id: U.uid('tp'), name: String(name).trim(), color: U.MARKERS[i % U.MARKERS.length].key };
      });
    },
    createGroup: function (data) {
      var g = {
        id: U.uid('g'), kind: data.kind === 'study' ? 'study' : 'project',
        name: (data.name || 'Untitled group').trim(),
        subject: (data.subject || '').trim(), color: data.color || 'sky',
        description: (data.description || '').trim(),
        topics: data.topics ? store.topicsFromNames(data.topics) : [],
        inviteCode: store.makeInviteCode(),
        ownerId: state.session.userId,
        memberIds: [state.session.userId],
        createdAt: new Date().toISOString(),
        links: []
      };
      state.groups.unshift(g);
      store.touch();
      return g;
    },
    addTopic: function (groupId, name) {
      var g = store.groupById(groupId);
      if (!g || !name || !String(name).trim()) return null;
      var topic = { id: U.uid('tp'), name: String(name).trim(), color: U.MARKERS[g.topics.length % U.MARKERS.length].key };
      g.topics.push(topic);
      store.touch();
      return topic;
    },
    renameTopic: function (groupId, topicId, name) {
      var g = store.groupById(groupId);
      if (!g) return;
      g.topics.forEach(function (t) { if (t.id === topicId) t.name = name; });
      store.touch();
    },
    removeTopic: function (groupId, topicId) {
      var g = store.groupById(groupId);
      if (!g) return;
      g.topics = g.topics.filter(function (t) { return t.id !== topicId; });
      state.notes.forEach(function (n) { if (n.topicId === topicId) n.topicId = null; });
      store.touch();
    },
    topicById: function (groupId, topicId) {
      var g = store.groupById(groupId);
      if (!g || !topicId) return null;
      return U.byId(g.topics || [], topicId);
    },
    makeInviteCode: function () {
      var letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      var out = '';
      for (var i = 0; i < 4; i++) out += letters[Math.floor(Math.random() * letters.length)];
      var out2 = '';
      for (var j = 0; j < 4; j++) out2 += letters[Math.floor(Math.random() * letters.length)];
      return out + '-' + out2;
    },
    updateGroup: function (id, patch) {
      var g = store.groupById(id);
      if (!g) return null;
      Object.assign(g, patch);
      store.touch();
      return g;
    },
    deleteGroup: function (id) {
      state.groups = state.groups.filter(function (g) { return g.id !== id; });
      state.tasks = state.tasks.filter(function (t) { return t.groupId !== id; });
      state.notes = state.notes.filter(function (n) { return !(n.scope === 'group' && n.groupId === id); });
      state.events.forEach(function (e) { if (e.groupId === id) e.groupId = null; });
      store.touch();
    },
    regenerateInvite: function (id) {
      var g = store.groupById(id);
      if (!g) return null;
      g.inviteCode = store.makeInviteCode();
      store.touch();
      return g.inviteCode;
    },
    addMemberByEmail: function (groupId, email) {
      var g = store.groupById(groupId);
      var clean = String(email || '').trim().toLowerCase();
      if (!g) return { ok: false, error: 'That group no longer exists.' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: 'Enter a valid email address, like maya@student.edu.' };
      var existing = null;
      for (var i = 0; i < state.users.length; i++) if (state.users[i].email.toLowerCase() === clean) existing = state.users[i];
      if (!existing) {
        var name = clean.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        existing = { id: U.uid('u'), name: name, email: clean, color: U.MARKERS[U.hashInt(clean) % U.MARKERS.length].key, invited: true };
        state.users.push(existing);
      }
      if (g.memberIds.indexOf(existing.id) !== -1) return { ok: false, error: existing.name + ' is already in this group.' };
      g.memberIds.push(existing.id);
      store.touch();
      return { ok: true, user: existing };
    },
    joinGroup: function (groupId) {
      var g = store.groupById(groupId);
      if (!g) return { ok: false, error: 'That invite link does not match a group.' };
      if (g.memberIds.indexOf(state.session.userId) !== -1) return { ok: true, already: true, group: g };
      g.memberIds.push(state.session.userId);
      store.touch();
      return { ok: true, group: g };
    },
    removeMember: function (groupId, userId, reassignToId) {
      var g = store.groupById(groupId);
      if (!g) return;
      g.memberIds = g.memberIds.filter(function (id) { return id !== userId; });
      state.tasks.forEach(function (t) {
        if (t.groupId !== groupId) return;
        if (t.assigneeIds.indexOf(userId) === -1) return;
        t.assigneeIds = t.assigneeIds.filter(function (id) { return id !== userId; });
        if (reassignToId && t.assigneeIds.indexOf(reassignToId) === -1) t.assigneeIds.push(reassignToId);
      });
      g.ownerId = g.memberIds.indexOf(g.ownerId) === -1 && g.memberIds.length ? g.memberIds[0] : g.ownerId;
      store.touch();
    },
    addGroupLink: function (groupId, label, url) {
      var g = store.groupById(groupId);
      if (!g) return;
      g.links.push({ id: U.uid('gl'), label: label, url: url });
      store.touch();
    },
    removeGroupLink: function (groupId, linkId) {
      var g = store.groupById(groupId);
      if (!g) return;
      g.links = g.links.filter(function (l) { return l.id !== linkId; });
      store.touch();
    },

    /* ---------- tasks ---------- */
    createTask: function (data) {
      var t = {
        id: U.uid('t'), groupId: data.groupId || null, title: (data.title || '').trim(),
        description: (data.description || '').trim(), dueAt: data.dueAt || null,
        assigneeIds: data.assigneeIds || [], status: data.status || 'todo',
        priority: data.priority || 'med', createdBy: state.session.userId,
        subtasks: data.subtasks || [], links: data.links || [],
        createdAt: new Date().toISOString(), completedAt: null
      };
      state.tasks.unshift(t);
      store.touch();
      return t;
    },
    updateTask: function (id, patch, opts) {
      var t = store.taskById(id);
      if (!t) return null;
      if (patch.status && patch.status !== t.status) {
        t.completedAt = patch.status === 'done' ? new Date().toISOString() : null;
      }
      Object.assign(t, patch);
      store.touch();
      return t;
    },
    deleteTask: function (id) {
      state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
      store.touch();
    },
    toggleSubtask: function (taskId, subId) {
      var t = store.taskById(taskId);
      if (!t) return;
      t.subtasks.forEach(function (s) { if (s.id === subId) s.done = !s.done; });
      store.touch();
    },
    STATUS: ['todo', 'doing', 'done'],
    STATUS_LABEL: { todo: 'Not started', doing: 'In progress', done: 'Done' },
    PRIORITY: ['low', 'med', 'high'],
    PRIORITY_LABEL: { low: 'Low', med: 'Medium', high: 'High' },

    tasksForGroup: function (groupId) {
      return U.sortBy(state.tasks.filter(function (t) { return t.groupId === groupId; }), function (t) { return t.dueAt || '9999'; });
    },
    /* A task with no group is a personal to-do. */
    personalTasks: function () {
      return state.tasks.filter(function (t) { return !t.groupId; });
    },
    postponeTask: function (id) {
      var t = store.taskById(id);
      if (!t) return null;
      var next;
      if (t.dueAt) {
        next = U.addDays(new Date(t.dueAt), 1);
      } else {
        next = U.addDays(U.startOfDay(new Date()), 1);
        next.setHours(9, 0, 0, 0);
      }
      return store.updateTask(id, { dueAt: next.toISOString() }, { quiet: true });
    },
    duplicateTask: function (id) {
      var t = store.taskById(id);
      if (!t) return null;
      return store.createTask({
        groupId: t.groupId, title: t.title, description: t.description,
        dueAt: t.dueAt, assigneeIds: t.assigneeIds.slice(), priority: t.priority,
        subtasks: (t.subtasks || []).map(function (s) { return { id: U.uid('s'), title: s.title, done: false }; }),
        links: (t.links || []).map(function (l) { return { id: U.uid('tl'), label: l.label, url: l.url }; })
      });
    },
    openTasksFor: function (userId) {
      return state.tasks.filter(function (t) { return t.status !== 'done' && t.assigneeIds.indexOf(userId) !== -1; });
    },
    overdueTasks: function (now) {
      var n = now || new Date();
      return U.sortBy(state.tasks.filter(function (t) { return t.status !== 'done' && t.dueAt && new Date(t.dueAt) < n; }), function (t) { return t.dueAt; });
    },
    dueSoonTasks: function (hours, now) {
      var n = now || new Date();
      var limit = n.getTime() + (hours || 48) * H;
      return U.sortBy(state.tasks.filter(function (t) {
        return t.status !== 'done' && t.dueAt && new Date(t.dueAt) >= n && new Date(t.dueAt) <= limit;
      }), function (t) { return t.dueAt; });
    },
    upcomingTasks: function (days, limit) {
      var limitMs = Date.now() + (days || 14) * D;
      return U.sortBy(state.tasks.filter(function (t) {
        return t.status !== 'done' && t.dueAt && new Date(t.dueAt) <= limitMs;
      }), function (t) { return t.dueAt; }).slice(0, limit || 50);
    },
    groupStats: function (groupId) {
      var list = store.tasksForGroup(groupId);
      var done = list.filter(function (t) { return t.status === 'done'; }).length;
      var now = new Date();
      var overdue = list.filter(function (t) { return t.status !== 'done' && t.dueAt && new Date(t.dueAt) < now; }).length;
      var next = U.sortBy(list.filter(function (t) { return t.status !== 'done'; }), function (t) { return t.dueAt; })[0] || null;
      return { total: list.length, done: done, open: list.length - done, overdue: overdue, pct: U.pct(done, list.length), next: next };
    },
    /* Study groups care about notes and sessions, not progress percentages. */
    studyStats: function (groupId) {
      var notes = store.notesForGroup(groupId);
      var group = store.groupById(groupId);
      var now = new Date();
      var sessions = U.sortBy(state.events.filter(function (e) {
        return e.groupId === groupId && e.type === 'session' && new Date(e.start) >= now;
      }), function (e) { return e.start; });
      return {
        notes: notes.filter(function (n) { return n.type !== 'request'; }).length,
        openRequests: notes.filter(function (n) { return n.type === 'request' && n.request && n.request.open; }).length,
        topics: (group && group.topics) || [],
        nextSession: sessions[0] || null
      };
    },
    weekLoad: function (groupId, days) {
      var group = store.groupById(groupId);
      if (!group) return [];
      var horizon = Date.now() + (days || 7) * D;
      return group.memberIds.map(function (uid) {
        var open = state.tasks.filter(function (t) {
          return t.groupId === groupId && t.status !== 'done' && t.assigneeIds.indexOf(uid) !== -1 &&
            t.dueAt && new Date(t.dueAt).getTime() <= horizon;
        });
        var overdue = open.filter(function (t) { return new Date(t.dueAt) < new Date(); }).length;
        return { user: store.userById(uid), count: open.length, overdue: overdue, tasks: open };
      }).sort(function (a, b) { return b.count - a.count; });
    },

    /* ---------- vault ---------- */
    createFolder: function (name, color) {
      var f = { id: U.uid('f'), name: (name || 'New subject').trim(), color: color || 'amber' };
      state.folders.push(f);
      store.touch();
      return f;
    },
    renameFolder: function (id, name) {
      var f = store.folderById(id);
      if (f) { f.name = name; store.touch(); }
    },
    deleteFolder: function (id, moveToId) {
      var f = store.folderById(id);
      if (!f) return;
      state.notes.forEach(function (n) {
        if (n.folderId === id) n.folderId = moveToId || null;
      });
      state.folders = state.folders.filter(function (x) { return x.id !== id; });
      store.touch();
    },
    createNote: function (data) {
      var n = {
        id: U.uid('n'), scope: data.scope || 'personal', groupId: data.groupId || null,
        folderId: data.folderId || null, topicId: data.topicId || null,
        type: data.type || 'note',
        title: (data.title || '').trim() || 'Untitled',
        body: data.body || '', url: data.url || null,
        fileId: data.fileId || null, fileName: data.fileName || null,
        fileType: data.fileType || null, fileSize: data.fileSize || null,
        demo: data.demo || null,
        tags: data.tags || [], pinned: !!data.pinned,
        request: data.type === 'request'
          ? { open: true, answeredBy: null, answeredAt: null, answerNoteId: null }
          : (data.request || null),
        createdBy: state.session.userId,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      state.notes.unshift(n);
      store.touch();
      return n;
    },
    /* Answer a note request with a link (or a short note that carries the link). */
    answerRequest: function (requestNoteId, answer) {
      var req = store.noteById(requestNoteId);
      if (!req || req.type !== 'request') return null;
      var url = String(answer.url || '').trim();
      var note = store.createNote({
        scope: 'group', groupId: req.groupId, topicId: req.topicId,
        type: url ? 'link' : 'note',
        title: String(answer.title || '').trim() || (url ? U.domainOf(url) : 'Answer'),
        body: String(answer.body || '').trim(), url: url || null,
        tags: req.tags || []
      });
      req.request = {
        open: false, answeredBy: state.session.userId,
        answeredAt: new Date().toISOString(), answerNoteId: note.id
      };
      req.updatedAt = new Date().toISOString();
      store.touch();
      return note;
    },
    unansweredRequests: function (groupId) {
      return store.notesForGroup(groupId).filter(function (n) {
        return n.type === 'request' && n.request && n.request.open;
      });
    },
    updateNote: function (id, patch) {
      var n = store.noteById(id);
      if (!n) return null;
      Object.assign(n, patch);
      n.updatedAt = new Date().toISOString();
      store.touch();
      return n;
    },
    deleteNote: function (id) {
      state.notes = state.notes.filter(function (x) { return x.id !== id; });
      store.touch();
    },
    personalNotes: function () { return state.notes.filter(function (n) { return n.scope === 'personal'; }); },
    notesForGroup: function (groupId) {
      return U.sortBy(state.notes.filter(function (n) { return n.scope === 'group' && n.groupId === groupId; }),
        function (n) { return n.createdAt; }, 'desc');
    },

    /* ---------- calendar ---------- */
    createEvent: function (data) {
      var e = {
        id: U.uid('e'), title: (data.title || '').trim() || 'New event',
        type: data.type || 'personal', start: data.start, end: data.end || null,
        groupId: data.groupId || null, location: data.location || '',
        reminderMinutes: data.reminderMinutes == null ? 60 : data.reminderMinutes,
        notes: data.notes || '', createdAt: new Date().toISOString()
      };
      state.events.push(e);
      store.touch();
      return e;
    },
    updateEvent: function (id, patch) {
      var e = store.eventById(id);
      if (!e) return null;
      Object.assign(e, patch);
      store.touch();
      return e;
    },
    deleteEvent: function (id) {
      state.events = state.events.filter(function (e) { return e.id !== id; });
      store.touch();
    },
    EVENT_TYPES: ['exam', 'session', 'meeting', 'personal'],
    EVENT_TYPE_LABEL: { exam: 'Exam', session: 'Study session', meeting: 'Meeting', personal: 'Personal' },
    allEvents: function () {
      var out = [];
      state.tasks.forEach(function (t) {
        if (!t.dueAt) return;
        var g = store.groupById(t.groupId);
        out.push({
          id: 'task:' + t.id, refId: t.id, kind: 'task', title: t.title,
          start: t.dueAt, end: U.addMinutes(t.dueAt, 30).toISOString(),
          groupId: t.groupId, color: g ? g.color : 'amber',
          done: t.status === 'done', status: t.status, groupName: g ? g.name : ''
        });
      });
      state.events.forEach(function (e) {
        var g = store.groupById(e.groupId);
        var color = { exam: 'coral', session: 'violet', meeting: 'sky', personal: 'amber' }[e.type] || 'amber';
        out.push({
          id: 'event:' + e.id, refId: e.id, kind: 'event', type: e.type, title: e.title,
          start: e.start, end: e.end, groupId: e.groupId, color: g ? g.color : color,
          groupName: g ? g.name : '', location: e.location || '', reminderMinutes: e.reminderMinutes
        });
      });
      return U.sortBy(out, function (e) { return e.start; });
    },
    eventsOnDay: function (day) {
      return store.allEvents().filter(function (e) { return U.isSameDay(new Date(e.start), day); });
    },
    stats: function () {
      var now = new Date();
      var open = state.tasks.filter(function (t) { return t.status !== 'done'; });
      return {
        groups: state.groups.length,
        openTasks: open.length,
        overdue: store.overdueTasks(now).length,
        dueThisWeek: store.dueSoonTasks(24 * 7, now).length,
        notes: state.notes.length
      };
    },

    /* ---------- search ---------- */
    search: function (query) {
      var q = String(query || '').trim();
      if (!q) return { groups: [], tasks: [], notes: [], events: [] };
      return {
        groups: state.groups.filter(function (g) { return U.match(g.name, q) || U.match(g.subject, q) || U.match(g.description, q); }).slice(0, 6),
        tasks: state.tasks.filter(function (t) { return U.match(t.title, q) || U.match(t.description, q); }).slice(0, 8),
        notes: state.notes.filter(function (n) {
          return U.match(n.title, q) || U.match(n.body, q) || (n.tags || []).some(function (t) { return U.match(t, q); });
        }).slice(0, 8),
        events: state.events.filter(function (e) { return U.match(e.title, q) || U.match(e.location, q); }).slice(0, 6)
      };
    },

    /* ---------- notifications ---------- */
    readNotification: function (id) {
      state.notifications.read[id] = new Date().toISOString();
      store.touch();
    },
    readAll: function (ids) {
      var now = new Date().toISOString();
      ids.forEach(function (id) { state.notifications.read[id] = now; });
      store.touch();
    },
    snoozeNotification: function (id, untilMs) {
      state.notifications.snoozed[id] = new Date(Date.now() + (untilMs || H)).toISOString();
      store.touch();
    },
    markSeen: function (ids) {
      ids.forEach(function (id) { state.notifications.seen[id] = new Date().toISOString(); });
      store.save();
    },

    /* ---------- settings ---------- */
    updateSettings: function (patch) {
      Object.keys(patch).forEach(function (k) {
        if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) {
          state.settings[k] = Object.assign({}, state.settings[k], patch[k]);
        } else {
          state.settings[k] = patch[k];
        }
      });
      store.touch();
    },
    setTheme: function (theme) {
      state.settings.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      store.touch();
    },
    pushSyncLog: function (text) {
      state.settings.syncLog.unshift({ id: U.uid('sync'), at: new Date().toISOString(), text: text });
      state.settings.syncLog = state.settings.syncLog.slice(0, 12);
    },

    /* ---------- data ---------- */
    exportJson: function () {
      var payload = {
        app: 'neoma', exportedAt: new Date().toISOString(), version: state.version,
        state: clone(state),
        note: 'Uploaded files live in IndexedDB and are not part of this export.'
      };
      return JSON.stringify(payload, null, 2);
    },
    importJson: function (text) {
      try {
        var parsed = JSON.parse(text);
        var incoming = parsed && parsed.state ? parsed.state : parsed;
        if (!incoming || !Array.isArray(incoming.users) || !Array.isArray(incoming.groups)) {
          return { ok: false, error: 'That file does not look like a Neoma export.' };
        }
        state = incoming;
        if (!state.settings) state.settings = N.seed.build().settings;
        if (!state.notifications) state.notifications = { read: {}, snoozed: {}, seen: {} };
        store.touch();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'Could not read that file as JSON.' };
      }
    },
    resetDemo: function () {
      state = N.seed.build();
      store.touch();
      return state;
    },
    clearFiles: function () {
      var all = [];
      state.notes.forEach(function (n) { if (n.fileId) all.push(n.fileId, n.fileId + ':thumb'); });
      return Promise.all(all.map(function (id) { return N.files.remove(id); })).then(function () {
        state.notes.forEach(function (n) { n.fileId = null; });
        store.touch();
      }).catch(function () { /* storage may be unavailable */ });
    }
  };

  /* apply theme as early as possible */
  var savedTheme = (function () {
    var s = U.storage.get(KEY, null);
    return s && s.settings && s.settings.theme ? s.settings.theme : 'light';
  })();
  document.documentElement.setAttribute('data-theme', savedTheme);

  N.store = store;
})();
