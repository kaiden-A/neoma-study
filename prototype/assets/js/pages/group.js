/* Neoma — one group: overview, task board, shared notes, members, activity. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  N.pages = N.pages || {};

  function inviteUrl(code) {
    return window.location.href.split('#')[0] + '#/join/' + code;
  }

  function groupMenu(anchor, group) {
    ui.menu(anchor, [
      { header: (group.kind === 'study' ? 'Study group' : 'Project group') + (group.subject ? ' · ' + group.subject : '') },
      { label: 'Copy invite link', icon: 'fa-link', onClick: function () {
        U.copy(inviteUrl(group.inviteCode)).then(function (ok) {
          ui.toast(ok ? 'Invite link copied' : 'Copy failed — code is ' + group.inviteCode, { kind: ok ? 'success' : 'danger', icon: 'fa-link' });
        });
      } },
      { label: 'Invite by email', icon: 'fa-envelope', onClick: function () { N.pages.inviteModal(group); } },
      (group.kind === 'study' ? { label: 'Manage topics', icon: 'fa-tags', onClick: function () { topicManagerModal(group); } } : null),
      { sep: true },
      { label: 'Rename group', icon: 'fa-pen', onClick: function () {
        ui.prompt({ title: 'Rename group', label: 'Group name', value: group.name, confirmLabel: 'Rename' }).then(function (name) {
          if (name && name.trim()) N.store.updateGroup(group.id, { name: name.trim() });
        });
      } },
      { label: 'Change colour', icon: 'fa-palette', onClick: function () {
        ui.modal({
          title: 'Group colour',
          body: '<div class="nm-swatches">' + U.MARKERS.map(function (m) {
            return '<label class="nm-swatch nm-mk-' + m.key + (m.key === group.color ? ' is-selected' : '') + '">' +
              '<input type="radio" name="gc" value="' + m.key + '"' + (m.key === group.color ? ' checked' : '') + '>' +
              '<span class="nm-swatch-dot"></span><span class="nm-sr">' + m.label + '</span></label>';
          }).join('') + '</div>',
          actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Save colour', variant: 'primary', onClick: function (close, panel) {
            var pick = panel.querySelector('input[name="gc"]:checked');
            if (pick) N.store.updateGroup(group.id, { color: pick.value });
            ui.toast('Colour updated', { kind: 'success' });
          } }],
          onMount: function (panel) {
            U.qsa('input[name="gc"]', panel).forEach(function (r) {
              r.addEventListener('change', function () {
                U.qsa('.nm-swatch', panel).forEach(function (s) { s.classList.remove('is-selected'); });
                r.closest('.nm-swatch').classList.add('is-selected');
              });
            });
          }
        });
      } },
      { sep: true },
      { label: 'Delete group', icon: 'fa-trash', danger: true, onClick: function () {
        ui.confirm({
          title: 'Delete “' + group.name + '”?',
          message: 'All of its tasks, shared notes and activity will be removed. This cannot be undone.',
          confirmLabel: 'Delete group', variant: 'danger'
        }).then(function (ok) {
          if (!ok) return;
          N.store.deleteGroup(group.id);
          ui.toast('Group deleted', { kind: 'info' });
          N.router.go('/groups');
        });
      } }
    ]);
  }

  N.pages.inviteModal = function (group) {
    ui.modal({
      title: 'Invite to ' + group.name,
      subtitle: 'Members join with the link, or you can add them by email.',
      size: 'md',
      body: '<div class="nm-form">' +
        '<div class="nm-field nm-field--full"><label class="nm-label" for="inv-email">Email address</label>' +
          '<div class="nm-inline-add"><input class="nm-input" id="inv-email" type="email" placeholder="teammate@student.edu">' +
          '<button type="button" class="nm-btn nm-btn--primary" data-invite-send>Send invite</button></div>' +
          '<p class="nm-help">In this prototype no email goes out — the person is added to the group instantly.</p></div>' +
        '<div class="nm-field nm-field--full"><label class="nm-label" for="inv-link">Invite link</label>' +
          '<div class="nm-inline-add"><input class="nm-input nm-mono" id="inv-link" readonly value="' + esc(inviteUrl(group.inviteCode)) + '">' +
          '<button type="button" class="nm-btn nm-btn--secondary" data-invite-copy>' + ui.icon('fa-copy') + 'Copy</button></div>' +
          '<p class="nm-help">Anyone with this link can join as a member.</p></div>' +
        '<div class="nm-field nm-field--full"><span class="nm-label">In the group</span>' +
          '<div class="nm-avatars nm-avatars--wrap">' + N.store.membersOf(group.id).map(function (m) { return ui.avatar(m, 32); }).join('') + '</div></div>' +
      '</div>',
      actions: [{ label: 'Done', variant: 'primary' }],
      onMount: function (panel) {
        var input = panel.querySelector('#inv-email');
        input.focus();
        function send() {
          var res = N.store.addMemberByEmail(group.id, input.value);
          if (!res.ok) {
            ui.toast(res.error, { kind: 'danger' });
            return;
          }
          ui.toast(res.user.name + ' added to the group', { kind: 'success', icon: 'fa-user-plus' });
          input.value = '';
          panel.querySelector('.nm-avatars').innerHTML = N.store.membersOf(group.id).map(function (m) { return ui.avatar(m, 32); }).join('');
        }
        panel.querySelector('[data-invite-send]').addEventListener('click', send);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
        panel.querySelector('[data-invite-copy]').addEventListener('click', function () {
          U.copy(inviteUrl(group.inviteCode)).then(function (ok) {
            ui.toast(ok ? 'Invite link copied' : 'Copy failed', { kind: ok ? 'success' : 'danger' });
          });
        });
      }
    });
  };

  /* ---------- tasks ---------- */
  function taskCard(task, group) {
    var members = (task.assigneeIds || []).map(function (id) { return N.store.userById(id); }).filter(Boolean);
    var doneSubs = (task.subtasks || []).filter(function (s) { return s.done; }).length;
    return '<article class="nm-boardcard nm-mk-' + esc(group.color) + (task.status === 'done' ? ' is-done' : '') + '" draggable="true" data-board-card="' + esc(task.id) + '" tabindex="0">' +
      '<div class="nm-boardcard-top">' +
        ui.priorityChip(task.priority) +
        (task.dueAt ? ui.dial(task.dueAt, task.status === 'done') : '') +
      '</div>' +
      '<h4 class="nm-boardcard-title"><span class="nm-task-text">' + esc(task.title) + '</span></h4>' +
      (task.description ? '<p class="nm-boardcard-desc">' + esc(U.truncate(U.plain(task.description), 84)) + '</p>' : '') +
      (task.subtasks && task.subtasks.length
        ? '<div class="nm-boardcard-subs"><span class="nm-mono">' + doneSubs + '/' + task.subtasks.length + '</span>' +
          ui.progress(U.pct(doneSubs, task.subtasks.length), { marker: group.color, label: 'Checklist' }) + '</div>'
        : '') +
      '<div class="nm-boardcard-ft">' +
        (task.status === 'done' ? ui.statusChip('done') : '') +
        (members.length ? ui.avatarStack(members, 3) : '<span class="nm-chip nm-chip--sm nm-chip--muted">Unassigned</span>') +
        ui.iconButton('fa-ellipsis', 'Task actions', { class: 'nm-iconbtn--sm', attrs: ' data-card-menu="' + esc(task.id) + '"' }) +
      '</div>' +
      '</article>';
  }

  function boardView(group) {
    var tasks = N.store.tasksForGroup(group.id);
    return '<div class="nm-board">' + N.store.STATUS.map(function (status) {
      var column = tasks.filter(function (t) { return t.status === status; });
      return '<section class="nm-col" data-col="' + status + '">' +
        '<header class="nm-col-hd"><h3 class="nm-col-title">' + esc(N.store.STATUS_LABEL[status]) + '</h3>' +
          '<span class="nm-chip nm-chip--sm nm-chip--muted">' + column.length + '</span></header>' +
        '<div class="nm-col-bd" data-drop="' + status + '">' +
          (column.length ? column.map(function (t) { return taskCard(t, group); }).join('')
            : '<p class="nm-col-empty">' + (status === 'todo' ? 'New work lands here.' : status === 'doing' ? 'Drag a card in when you start it.' : 'Finished work piles up here.') + '</p>') +
        '</div></section>';
    }).join('') + '</div>';
  }

  function listView(group) {
    var tasks = N.store.tasksForGroup(group.id);
    if (!tasks.length) return ui.empty({ compact: true, icon: 'fa-list-check', title: 'No tasks yet', body: 'Add the first one so deadlines start counting.' });
    return '<div class="nm-table" role="table" aria-label="Tasks">' +
      '<div class="nm-table-hd" role="row">' +
        '<span role="columnheader">Task</span><span role="columnheader">Assignee</span><span role="columnheader">Due</span><span role="columnheader">Status</span><span role="columnheader"></span>' +
      '</div>' +
      tasks.map(function (t) {
        var members = (t.assigneeIds || []).map(function (id) { return N.store.userById(id); }).filter(Boolean);
        return '<div class="nm-table-row' + (t.status === 'done' ? ' is-done' : '') + '" role="row" data-list-task="' + esc(t.id) + '">' +
          '<span role="cell" class="nm-table-task"><button type="button" class="nm-task-check" data-task-toggle="' + esc(t.id) + '" aria-label="Toggle complete">' + ui.icon('fa-check') + '</button>' +
            '<span class="nm-task-text">' + esc(t.title) + '</span>' + (t.priority === 'high' && t.status !== 'done' ? ui.priorityChip('high') : '') + '</span>' +
          '<span role="cell">' + (members.length ? ui.avatarStack(members, 3) : '<span class="nm-chip nm-chip--sm nm-chip--muted">Nobody</span>') + '</span>' +
          '<span role="cell" class="nm-mono nm-time">' + (t.dueAt ? esc(U.fmtDateTime(t.dueAt)) : '—') + '</span>' +
          '<span role="cell"><select class="nm-select nm-select--sm" data-status-select="' + esc(t.id) + '" aria-label="Status for ' + esc(t.title) + '">' +
            N.store.STATUS.map(function (s) { return '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + N.store.STATUS_LABEL[s] + '</option>'; }).join('') +
          '</select></span>' +
          '<span role="cell">' + ui.dial(t.dueAt, t.status === 'done', { showLabel: false }) + '</span>' +
          '</div>';
      }).join('') + '</div>';
  }

  function tasksPanel(group, ctx) {
    var isStudy = group.kind === 'study';
    var tabId = isStudy ? 'plan' : 'tasks';
    var view = ctx.query.view === 'list' ? 'list' : 'board';
    return '<div class="nm-tabpanel">' +
      '<div class="nm-toolbar">' +
        '<div class="nm-seg" role="tablist" aria-label="Task view">' +
          '<a role="tab" class="nm-seg-btn' + (view === 'board' ? ' is-active' : '') + '" href="#/groups/' + esc(group.id) + '?tab=' + tabId + '&view=board">' + ui.icon('fa-table-columns') + 'Board</a>' +
          '<a role="tab" class="nm-seg-btn' + (view === 'list' ? ' is-active' : '') + '" href="#/groups/' + esc(group.id) + '?tab=' + tabId + '&view=list">' + ui.icon('fa-list') + 'List</a>' +
        '</div>' +
        '<span class="nm-toolbar-spacer"></span>' +
        '<button type="button" class="nm-btn nm-btn--primary" data-add-task>' + ui.icon('fa-plus') + (isStudy ? 'Add goal' : 'Add task') + '</button>' +
      '</div>' +
      (isStudy ? '<p class="nm-help">Optional. Notes and sessions are the point — this is just somewhere to park reading goals.</p>' : '') +
      (view === 'board' ? boardView(group) : listView(group)) +
      '<p class="nm-help nm-board-hint">' + ui.icon('fa-hand-pointer') + ' Drag cards between columns, or use the card menu. Every change is saved locally.</p>' +
      '</div>';
  }

  /* Study groups use the same board, framed as an optional plan. */
  function planPanel(group, ctx) { return tasksPanel(group, ctx); }

  /* ---------- topics ---------- */
  function topicManagerModal(group) {
    function rows() {
      var topics = N.store.groupById(group.id).topics;
      if (!topics.length) return '<p class="nm-body-text">No topics yet. Add the units you trade notes from.</p>';
      return '<ul class="nm-topiclist">' + topics.map(function (t) {
        return '<li class="nm-topicrow" data-topic-row="' + esc(t.id) + '">' +
          '<span class="nm-dot nm-mk-' + esc(t.color) + '"></span>' +
          '<input class="nm-input" value="' + esc(t.name) + '" data-topic-name="' + esc(t.id) + '" aria-label="Topic name">' +
          '<button type="button" class="nm-iconbtn nm-iconbtn--sm" data-topic-remove="' + esc(t.id) + '" aria-label="Remove ' + esc(t.name) + '">' + ui.icon('fa-xmark') + '</button>' +
          '</li>';
      }).join('') + '</ul>';
    }
    ui.modal({
      title: 'Topics in ' + group.name,
      subtitle: 'Shared notes are filed under these, so the crew can filter by unit.',
      size: 'sm',
      body: '<div data-topic-body>' + rows() + '</div>' +
        '<div class="nm-inline-add"><input class="nm-input" data-topic-new placeholder="Add a topic, e.g. MATH201">' +
        '<button type="button" class="nm-btn nm-btn--secondary" data-topic-add>Add</button></div>',
      actions: [{ label: 'Done', variant: 'primary' }],
      onMount: function (panel) {
        function repaint() { panel.querySelector('[data-topic-body]').innerHTML = rows(); }
        function add() {
          var input = panel.querySelector('[data-topic-new]');
          if (!input.value.trim()) return;
          N.store.addTopic(group.id, input.value);
          input.value = '';
          repaint();
        }
        panel.querySelector('[data-topic-add]').addEventListener('click', add);
        panel.querySelector('[data-topic-new]').addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
        panel.addEventListener('change', function (e) {
          var input = e.target.closest('[data-topic-name]');
          if (!input || !input.value.trim()) return;
          N.store.renameTopic(group.id, input.getAttribute('data-topic-name'), input.value.trim());
          ui.toast('Topic renamed', { kind: 'success' });
        });
        panel.addEventListener('click', function (e) {
          var remove = e.target.closest('[data-topic-remove]');
          if (!remove) return;
          N.store.removeTopic(group.id, remove.getAttribute('data-topic-remove'));
          repaint();
        });
        var first = panel.querySelector('[data-topic-new]');
        if (first) first.focus();
      }
    });
  }

  /* ---------- notes ---------- */
  /* Filter + composer mode live outside the render so a store change keeps them. */
  var noteView = {};

  function noteState(groupId) {
    if (!noteView[groupId]) {
      noteView[groupId] = {
        topic: 'all', mode: 'note', linkOpen: false,
        draft: { title: '', body: '', linkLabel: '', linkUrl: '' }
      };
    }
    return noteView[groupId];
  }

  function topicChip(group, topic) {
    if (!topic) return '';
    return ui.markerChip(topic.name, topic.color, { small: true });
  }

  function requestCard(group, n) {
    var req = n.request || { open: true };
    var answer = req.answerNoteId ? N.store.noteById(req.answerNoteId) : null;
    return '<article class="nm-notefeed-item nm-request' + (req.open ? ' is-open' : '') + '" data-note-item="' + esc(n.id) + '">' +
      '<div class="nm-notefeed-icon nm-mk-amber">' + ui.icon('fa-circle-question') + '</div>' +
      '<div class="nm-notefeed-bd">' +
        '<div class="nm-notefeed-top">' + ui.avatar(N.store.userById(n.createdBy), 22) +
          '<span class="nm-notefeed-author">' + esc(N.store.userName(n.createdBy)) + '</span>' +
          ui.relTime(n.createdAt) +
          topicChip(group, N.store.topicById(group.id, n.topicId)) +
          '<span class="nm-chip nm-chip--sm ' + (req.open ? 'nm-chip--warn' : 'nm-chip--ok') + '">' +
            ui.icon(req.open ? 'fa-hourglass-half' : 'fa-check') + (req.open ? 'Waiting' : 'Answered') + '</span>' +
          ui.iconButton('fa-ellipsis', 'Request actions', { class: 'nm-iconbtn--sm', attrs: ' data-note-menu="' + esc(n.id) + '"' }) +
        '</div>' +
        '<h4 class="nm-notefeed-title">' + esc(n.title) + '</h4>' +
        (n.body ? '<p class="nm-notefeed-body">' + U.multiline(n.body) + '</p>' : '') +
        (req.open
          ? '<div class="nm-request-actions"><button type="button" class="nm-btn nm-btn--primary nm-btn--sm" data-answer="' + esc(n.id) + '">' +
              ui.icon('fa-share-nodes') + 'Answer with a link</button></div>'
          : (answer
              ? '<div class="nm-request-answer">' + ui.icon('fa-check') + 'Answered by ' + esc(N.store.userName(req.answeredBy)) +
                ' · <a class="nm-link" href="#/vault/' + esc(answer.id) + '">' + esc(U.truncate(answer.title, 40)) + '</a></div>'
              : '<div class="nm-request-answer">' + ui.icon('fa-check') + 'Answered by ' + esc(N.store.userName(req.answeredBy)) + '</div>')) +
      '</div></article>';
  }

  function notesPanel(group) {
    var isStudy = group.kind === 'study';
    var state = noteState(group.id);
    var topics = group.topics || [];
    var all = N.store.notesForGroup(group.id);
    var visible = all.filter(function (n) {
      if (state.topic === 'all') return true;
      if (state.topic === 'general') return !n.topicId;
      return n.topicId === state.topic;
    });
    /* unanswered requests surface first — they are the only thing with a deadline */
    var sorted = visible.slice().sort(function (a, b) {
      var aOpen = a.type === 'request' && a.request && a.request.open ? 1 : 0;
      var bOpen = b.type === 'request' && b.request && b.request.open ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    var topicField = topics.length
      ? ui.field({
          label: 'Topic', id: 'np-topic', type: 'select',
          options: [{ value: '', label: 'General' }].concat(topics.map(function (t) { return { value: t.id, label: t.name }; })),
          value: state.topic !== 'all' && state.topic !== 'general' ? state.topic : ''
        })
      : '';

    var filterChips = topics.length
      ? '<div class="nm-topicbar">' +
          '<button type="button" class="nm-chip nm-chip--sm nm-chip--link' + (state.topic === 'all' ? ' is-active' : '') + '" data-topic="all">' +
            'All<span class="nm-mono">' + all.length + '</span></button>' +
          topics.map(function (t) {
            var count = all.filter(function (n) { return n.topicId === t.id; }).length;
            return '<button type="button" class="nm-chip nm-chip--sm nm-chip--link nm-mk-' + esc(t.color) + (state.topic === t.id ? ' is-active' : '') + '" data-topic="' + esc(t.id) + '">' +
              esc(t.name) + '<span class="nm-mono">' + count + '</span></button>';
          }).join('') +
          '<button type="button" class="nm-chip nm-chip--sm nm-chip--link' + (state.topic === 'general' ? ' is-active' : '') + '" data-topic="general">' +
            'General<span class="nm-mono">' + all.filter(function (n) { return !n.topicId; }).length + '</span></button>' +
        '</div>'
      : '';

    var draft = state.draft;
    var composer = '<div class="nm-composer' + (isStudy ? ' nm-composer--study' : '') + '">' +
      '<input class="nm-input nm-composer-title" data-note-title value="' + esc(draft.title) + '" placeholder="Title' + (state.mode === 'request' ? ' — what are you after?' : ' (optional)') + '" aria-label="Note title">' +
      '<textarea class="nm-textarea" data-note-body rows="3" placeholder="' +
        (state.mode === 'request' ? 'Add the detail — which lecture, which week, what you can trade.' : (isStudy ? 'What did you find useful? Paste the summary, the method, the link.' : 'Minutes, decisions, what changed…')) +
        '" aria-label="Note body">' + esc(draft.body) + '</textarea>' +
      '<div class="nm-composer-link"' + (state.linkOpen ? '' : ' hidden') + '>' +
        '<input class="nm-input" data-link-label value="' + esc(draft.linkLabel) + '" placeholder="Link label">' +
        '<input class="nm-input" data-link-url value="' + esc(draft.linkUrl) + '" placeholder="https://…">' +
      '</div>' +
      '<div class="nm-composer-actions">' +
        '<button type="button" class="nm-btn nm-btn--ghost' + (state.mode === 'request' ? ' is-active' : '') + '" data-composer-request>' +
          ui.icon('fa-circle-question') + (state.mode === 'request' ? 'Request mode on' : 'Ask for a note') + '</button>' +
        '<button type="button" class="nm-btn nm-btn--ghost" data-composer-link-toggle>' + ui.icon('fa-link') + 'Include a link</button>' +
        '<span class="nm-toolbar-spacer"></span>' +
        '<button type="button" class="nm-btn nm-btn--primary" data-note-post>' +
          ui.icon(state.mode === 'request' ? 'fa-circle-question' : 'fa-paper-plane') + (state.mode === 'request' ? 'Post request' : 'Post to group') + '</button>' +
      '</div>' + (topics.length ? '<div class="nm-composer-topic">' + topicField + '</div>' : '') + '</div>';

    var feed = sorted.length
      ? '<div class="nm-notefeed">' + sorted.map(function (n) {
          if (n.type === 'request') return requestCard(group, n);
          var topic = N.store.topicById(group.id, n.topicId);
          return '<article class="nm-notefeed-item" data-note-item="' + esc(n.id) + '">' +
            '<div class="nm-notefeed-icon nm-mk-' + ui.noteType(n.type).marker + '">' + ui.icon(ui.noteType(n.type).icon) + '</div>' +
            '<div class="nm-notefeed-bd">' +
              '<div class="nm-notefeed-top">' + ui.avatar(N.store.userById(n.createdBy), 22) +
                '<span class="nm-notefeed-author">' + esc(N.store.userName(n.createdBy)) + '</span>' +
                ui.relTime(n.createdAt) +
                topicChip(group, topic) +
                (n.type === 'link' && n.url ? '<a class="nm-link nm-notefeed-open" href="' + esc(n.url) + '" target="_blank" rel="noopener">Open link ' + ui.icon('fa-arrow-up-right-from-square') + '</a>' : '') +
                ui.iconButton('fa-ellipsis', 'Note actions', { class: 'nm-iconbtn--sm', attrs: ' data-note-menu="' + esc(n.id) + '"' }) +
              '</div>' +
              '<h4 class="nm-notefeed-title">' + esc(n.title) + '</h4>' +
              (n.body ? '<p class="nm-notefeed-body">' + U.multiline(n.body) + '</p>' : '') +
            '</div></article>';
        }).join('') + '</div>'
      : ui.empty({
          icon: isStudy ? 'fa-note-sticky' : 'fa-note-sticky',
          title: state.topic === 'all' ? 'Nothing shared yet' : 'Nothing under this topic yet',
          body: isStudy
            ? 'Share what you have — a summary, a photo, a link — or ask the group for what you are missing.'
            : 'Post minutes, decisions or a link to the shared drive. Everyone in the group sees it.'
        });

    return '<div class="nm-tabpanel">' +
      (topics.length
        ? '<div class="nm-toolbar"><span class="nm-mono nm-meta">' + topics.length + ' topic' + (topics.length === 1 ? '' : 's') + '</span>' +
          '<span class="nm-toolbar-spacer"></span>' +
          '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-topic-manage>' + ui.icon('fa-sliders') + 'Manage topics</button></div>'
        : '<div class="nm-toolbar"><span class="nm-mono nm-meta">No topics yet' + (isStudy ? ' — add the units you trade notes from' : '') + '</span>' +
          '<span class="nm-toolbar-spacer"></span>' +
          '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-topic-manage>' + ui.icon('fa-plus') + 'Add topics</button></div>') +
      filterChips +
      ui.card(composer) +
      feed +
      linksCard(group) +
      '</div>';
  }

  /* Answer a request with a link (or a short note carrying it). */
  function answerModal(group, requestNoteId) {
    var req = N.store.noteById(requestNoteId);
    if (!req) return;
    ui.modal({
      title: 'Answer “' + req.title + '”',
      subtitle: 'A link works best — a drive folder, the slides, or your own note.',
      size: 'sm',
      body: '<div class="nm-form">' +
        ui.field({ label: 'Link', id: 'an-url', type: 'url', placeholder: 'https://…', class: 'nm-field--full' }) +
        ui.field({ label: 'Title', id: 'an-title', placeholder: 'Leave blank to use the domain', class: 'nm-field--full' }) +
        ui.field({ label: 'Note', id: 'an-body', type: 'textarea', rows: 3, placeholder: 'Anything they should know.', class: 'nm-field--full' }) +
        '</div>',
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Post answer', variant: 'primary', onClick: function (close, panel) {
          var url = panel.querySelector('#an-url').value.trim();
          var title = panel.querySelector('#an-title').value.trim();
          var body = panel.querySelector('#an-body').value.trim();
          if (!url && !body) {
            ui.toast('Add a link or a short note first', { kind: 'danger' });
            return false;
          }
          var note = N.store.answerRequest(req.id, { url: url, title: title, body: body });
          ui.toast('Answer posted', {
            kind: 'success', icon: 'fa-check', actionLabel: 'Open',
            onAction: function () { N.router.go('/vault/' + note.id); }
          });
        } }
      ],
      onMount: function (panel) { panel.querySelector('#an-url').focus(); }
    });
  }

  /* ---------- shared links (they belong with the group's references) ---------- */
  function linksCard(group) {
    return ui.card('<ul class="nm-linklist">' + (group.links || []).map(function (l) {
      return '<li class="nm-linkrow">' + ui.icon('fa-link') +
        '<a class="nm-linkrow-label" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>' +
        '<span class="nm-mono nm-linkrow-url">' + esc(U.domainOf(l.url)) + '</span>' +
        '<button type="button" class="nm-iconbtn nm-iconbtn--sm" data-link-del="' + esc(l.id) + '" aria-label="Remove link">' + ui.icon('fa-xmark') + '</button></li>';
    }).join('') + '</ul>' +
      '<div class="nm-inline-add"><input class="nm-input" data-glink-label placeholder="Label">' +
      '<input class="nm-input" data-glink-url placeholder="https://…">' +
      '<button type="button" class="nm-btn nm-btn--secondary" data-glink-add>Attach</button></div>',
      { title: 'Group links', actions: '<span class="nm-mono nm-meta">briefs, drives, references</span>' });
  }

  /* ---------- members ---------- */
  function membersPanel(group) {
    var members = N.store.membersOf(group.id);
    var load = N.store.weekLoad(group.id, 7);
    var maxLoad = Math.max.apply(null, [1].concat(load.map(function (l) { return l.count; })));
    return '<div class="nm-tabpanel">' +
      ui.card(
        '<div class="nm-inviterow">' +
          '<div class="nm-inline-add nm-inline-add--grow"><input class="nm-input" type="email" data-member-email placeholder="teammate@student.edu" aria-label="Invite by email">' +
          '<button type="button" class="nm-btn nm-btn--primary" data-member-add>' + ui.icon('fa-user-plus') + 'Add member</button></div>' +
        '</div>' +
        '<div class="nm-invitelink"><span class="nm-label">Invite link</span>' +
          '<div class="nm-inline-add"><input class="nm-input nm-mono" readonly value="' + esc(inviteUrl(group.inviteCode)) + '" aria-label="Invite link">' +
          '<button type="button" class="nm-btn nm-btn--secondary" data-copy-invite>' + ui.icon('fa-copy') + 'Copy</button>' +
          '<a class="nm-btn nm-btn--ghost" href="#/join/' + esc(group.inviteCode) + '">Preview</a></div>' +
        '</div>', { title: 'Invite people', actions: '<span class="nm-mono nm-meta">code ' + esc(group.inviteCode) + '</span>' }) +
      ui.card(load.map(function (l) {
        return '<div class="nm-loadrow">' +
          '<span class="nm-loadname">' + ui.avatar(l.user, 24) + '<span>' + esc(l.user ? l.user.name : '?') + '</span></span>' +
          '<span class="nm-loadbar"><span class="nm-loadbar-fill nm-mk-' + esc(group.color) + '" style="width:' + Math.round((l.count / maxLoad) * 100) + '%"></span></span>' +
          '<span class="nm-mono nm-loadcount">' + l.count + (l.overdue ? ' · ' + l.overdue + ' late' : '') + '</span>' +
          '</div>';
      }).join(''), { title: 'Workload this week', actions: '<span class="nm-mono nm-meta">open tasks due in 7 days</span>' }) +
      ui.card('<ul class="nm-memberlist">' + members.map(function (m) {
        var open = N.store.openTasksFor(m.id).filter(function (t) { return t.groupId === group.id; }).length;
        return '<li class="nm-memberrow">' + ui.avatar(m, 36) +
          '<div class="nm-memberinfo"><p class="nm-membername">' + esc(m.name) +
            (m.id === group.ownerId ? '<span class="nm-chip nm-chip--sm nm-chip--info">' + ui.icon('fa-crown') + 'Owner</span>' : '') +
            (m.invited ? '<span class="nm-chip nm-chip--sm nm-chip--warn">' + ui.icon('fa-envelope') + 'Invited</span>' : '') +
            (m.id === N.store.state.session.userId ? '<span class="nm-chip nm-chip--sm nm-chip--muted">You</span>' : '') +
          '</p><p class="nm-meta nm-mono">' + esc(m.email) + '</p></div>' +
          '<div class="nm-memberside"><span class="nm-mono nm-meta">' + open + ' open task' + (open === 1 ? '' : 's') + '</span>' +
          (m.id !== group.ownerId ? ui.iconButton('fa-user-minus', 'Remove ' + m.name, { class: 'nm-iconbtn--sm', attrs: ' data-member-remove="' + esc(m.id) + '"' }) : '') +
          '</div></li>';
      }).join('') + '</ul>', { title: members.length + ' member' + (members.length === 1 ? '' : 's') }) +
      '</div>';
  }

  /* ---------- render ---------- */
  function render(ctx, root) {
    var group = N.store.groupById(ctx.params.id);
    if (!group) {
      root.innerHTML = '<div class="nm-page">' + ui.empty({
        icon: 'fa-circle-question', title: 'That group is gone',
        body: 'It may have been deleted. Head back to the group list.',
        actionLabel: 'Back to groups'
      }) + '</div>';
      U.delegate(root, '[data-empty-action]', 'click', function () { N.router.go('/groups'); });
      return;
    }
    var isStudy = group.kind === 'study';
    var tab = ctx.query.tab || (isStudy ? 'notes' : 'tasks');
    var stats = N.store.groupStats(group.id);
    var study = isStudy ? N.store.studyStats(group.id) : null;
    var notes = N.store.notesForGroup(group.id);
    var members = N.store.membersOf(group.id);
    var tabs = isStudy
      ? [
          { id: 'notes', label: 'Notes', icon: 'fa-note-sticky', count: notes.length },
          { id: 'members', label: 'Members', icon: 'fa-user-group', count: members.length },
          { id: 'plan', label: 'Plan', icon: 'fa-list-check', count: stats.open }
        ]
      : [
          { id: 'tasks', label: 'Tasks', icon: 'fa-list-check', count: stats.open },
          { id: 'notes', label: 'Notes', icon: 'fa-note-sticky', count: notes.length },
          { id: 'members', label: 'Members', icon: 'fa-user-group', count: members.length }
        ];

    var panels = { tasks: tasksPanel, plan: planPanel, notes: notesPanel, members: membersPanel };
    var panelFn = panels[tab] || (isStudy ? panels.notes : panels.tasks);

    var strip = isStudy
      ? '<p class="nm-strip">' +
          '<span class="nm-mono">' + study.notes + ' shared note' + (study.notes === 1 ? '' : 's') + '</span>' +
          '<span class="nm-mono">' + members.length + ' members</span>' +
          '<span class="nm-mono">' + (group.topics.length ? group.topics.length + ' topics' : 'no topics') + '</span>' +
          (study.openRequests ? '<span class="nm-chip nm-chip--sm nm-chip--warn">' + ui.icon('fa-circle-question') + study.openRequests + ' request' + (study.openRequests === 1 ? '' : 's') + ' waiting</span>' : '') +
          (study.nextSession
            ? '<span class="nm-strip-next">' + ui.dial(study.nextSession.start, false, { showLabel: false }) +
              '<span class="nm-mono">next session ' + esc(U.fmtRelative(study.nextSession.start)) + '</span></span>'
            : '<span class="nm-mono">no session booked</span>') +
        '</p>'
      : '<p class="nm-strip">' +
          '<span class="nm-mono">' + stats.open + ' open</span>' +
          '<span class="nm-mono">' + stats.done + '/' + stats.total + ' done</span>' +
          '<span class="nm-mono">' + stats.pct + '%</span>' +
          (stats.next
            ? '<span class="nm-strip-next">' + ui.dial(stats.next.dueAt, false, { showLabel: false }) + '<span class="nm-mono">next ' + esc(U.fmtRelative(stats.next.dueAt)) + '</span></span>'
            : '<span class="nm-mono">nothing dated</span>') +
        '</p>';

    root.innerHTML = '<div class="nm-page nm-page--group nm-mk-' + esc(group.color) + '">' +
      '<header class="nm-ghead">' +
        '<div class="nm-ghead-top">' +
          '<a class="nm-backlink" href="#/groups">' + ui.icon('fa-arrow-left') + 'All groups</a>' +
          '<div class="nm-ghead-actions">' +
            (isStudy ? '<button type="button" class="nm-btn nm-btn--primary" data-new-session>' + ui.icon('fa-book-open-reader') + 'Schedule session</button>' : '') +
            '<button type="button" class="nm-btn nm-btn--secondary" data-invite>' + ui.icon('fa-user-plus') + 'Invite</button>' +
            ui.iconButton('fa-ellipsis', 'Group actions', { attrs: ' data-group-menu' }) +
          '</div>' +
        '</div>' +
        '<div class="nm-ghead-main">' +
          '<span class="nm-ghead-bar"></span>' +
          '<div>' +
            '<div class="nm-ghead-chips">' +
              '<span class="nm-chip nm-chip--sm nm-chip--muted">' + ui.icon(isStudy ? 'fa-note-sticky' : 'fa-list-check') + (isStudy ? 'Study group' : 'Project group') + '</span>' +
              (group.subject ? ui.markerChip(group.subject, group.color, { small: true }) : '') +
              (!isStudy && stats.overdue ? '<span class="nm-chip nm-chip--sm nm-chip--danger">' + ui.icon('fa-circle-exclamation') + stats.overdue + ' overdue</span>' : '') + '</div>' +
            '<h1 class="nm-title" id="page-title">' + esc(group.name) + '</h1>' +
            '<p class="nm-meta">' + esc(group.description || 'No description yet — add one from the group menu.') + '</p>' +
          '</div>' +
          '<div class="nm-ghead-side">' + ui.avatarStack(members, 5) + '</div>' +
        '</div>' +
        strip +
        ui.tabs(tabs, tab, '#/groups/' + group.id) +
      '</header>' +
      panelFn(group, ctx) +
      '</div>';

    /* shared wiring */
    U.delegate(root, '[data-invite]', 'click', function () { N.pages.inviteModal(group); });
    U.delegate(root, '[data-group-menu]', 'click', function (e, btn) { groupMenu(btn, group); });
    U.delegate(root, '[data-add-task]', 'click', function () { N.taskModal.open({ defaults: { groupId: group.id } }); });
    U.delegate(root, '[data-task]', 'click', function (e, row) {
      if (e.target.closest('[data-task-toggle]')) return;
      var t = N.store.taskById(row.getAttribute('data-task'));
      if (t) N.taskModal.open({ task: t });
    });
    U.delegate(root, '[data-board-card]', 'click', function (e, card) {
      if (e.target.closest('[data-card-menu]')) return;
      var t = N.store.taskById(card.getAttribute('data-board-card'));
      if (t) N.taskModal.open({ task: t });
    });
    U.delegate(root, '[data-task-toggle]', 'click', function (e, btn) {
      e.stopPropagation();
      var t = N.store.taskById(btn.getAttribute('data-task-toggle'));
      if (!t) return;
      var was = t.status;
      var next = was === 'done' ? 'doing' : 'done';
      N.store.updateTask(t.id, { status: next }, { quiet: true });
      if (next === 'done') {
        ui.toast('“' + U.truncate(t.title, 28) + '” done', {
          kind: 'success', icon: 'fa-check', actionLabel: 'Undo',
          onAction: function () { N.store.updateTask(t.id, { status: was }, { quiet: true }); }
        });
      }
    });
    U.delegate(root, '[data-card-menu]', 'click', function (e, btn) {
      e.stopPropagation();
      var t = N.store.taskById(btn.getAttribute('data-card-menu'));
      if (!t) return;
      ui.menu(btn, [
        { header: 'Move to' },
        { label: 'Not started', icon: 'fa-circle', disabled: t.status === 'todo', onClick: function () { N.store.updateTask(t.id, { status: 'todo' }); } },
        { label: 'In progress', icon: 'fa-play', disabled: t.status === 'doing', onClick: function () { N.store.updateTask(t.id, { status: 'doing' }); } },
        { label: 'Done', icon: 'fa-check', disabled: t.status === 'done', onClick: function () { N.store.updateTask(t.id, { status: 'done' }); } },
        { sep: true },
        { label: 'Edit task', icon: 'fa-pen', onClick: function () { N.taskModal.open({ task: t }); } },
        { label: 'Delete task', icon: 'fa-trash', danger: true, onClick: function () {
          N.store.deleteTask(t.id);
          ui.toast('Task deleted', { kind: 'info' });
        } }
      ]);
    });
    U.delegate(root, '[data-status-select]', 'change', function (e, sel) {
      N.store.updateTask(sel.getAttribute('data-status-select'), { status: sel.value });
    });
    U.delegate(root, '[data-list-task]', 'click', function (e, row) {
      if (e.target.closest('select') || e.target.closest('[data-task-toggle]')) return;
      var t = N.store.taskById(row.getAttribute('data-list-task'));
      if (t) N.taskModal.open({ task: t });
    });

    /* board drag & drop */
    var board = root.querySelector('.nm-board');
    if (board) {
      U.qsa('[data-board-card]', board).forEach(function (card) {
        card.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', card.getAttribute('data-board-card'));
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('is-dragging');
        });
        card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); });
        card.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          var t = N.store.taskById(card.getAttribute('data-board-card'));
          if (t) N.taskModal.open({ task: t });
        });
      });
      U.qsa('[data-drop]', board).forEach(function (zone) {
        zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-dragover'); });
        zone.addEventListener('dragleave', function () { zone.classList.remove('is-dragover'); });
        zone.addEventListener('drop', function (e) {
          e.preventDefault();
          zone.classList.remove('is-dragover');
          var id = e.dataTransfer.getData('text/plain');
          var t = N.store.taskById(id);
          if (!t) return;
          var status = zone.getAttribute('data-drop');
          if (t.status === status) return;
          var was = t.status;
          N.store.updateTask(t.id, { status: status });
          ui.toast('Moved to ' + N.store.STATUS_LABEL[status], {
            kind: 'success', actionLabel: 'Undo',
            onAction: function () { N.store.updateTask(t.id, { status: was }, { quiet: true }); }
          });
        });
      });
    }

    /* group links */
    U.delegate(root, '[data-glink-add]', 'click', function () {
      var label = root.querySelector('[data-glink-label]');
      var url = root.querySelector('[data-glink-url]');
      if (!url.value.trim()) return;
      N.store.addGroupLink(group.id, label.value.trim() || U.domainOf(url.value), url.value.trim());
      ui.toast('Link attached', { kind: 'success', icon: 'fa-link' });
    });
    U.delegate(root, '[data-link-del]', 'click', function (e, btn) {
      N.store.removeGroupLink(group.id, btn.getAttribute('data-link-del'));
    });

    /* notes composer + topic controls */
    var ns = noteState(group.id);
    function captureDraft() {
      var t = root.querySelector('[data-note-title]');
      var b = root.querySelector('[data-note-body]');
      var ll = root.querySelector('[data-link-label]');
      var lu = root.querySelector('[data-link-url]');
      if (t) ns.draft.title = t.value;
      if (b) ns.draft.body = b.value;
      if (ll) ns.draft.linkLabel = ll.value;
      if (lu) ns.draft.linkUrl = lu.value;
    }
    function repaint() { N.router.render({ keepScroll: true, keepFocus: true }); }
    U.delegate(root, '[data-topic]', 'click', function (e, btn) {
      captureDraft();
      ns.topic = btn.getAttribute('data-topic');
      repaint();
    });
    U.delegate(root, '[data-topic-manage]', 'click', function () { captureDraft(); topicManagerModal(group); });
    U.delegate(root, '[data-answer]', 'click', function (e, btn) {
      answerModal(group, btn.getAttribute('data-answer'));
    });
    U.delegate(root, '[data-new-session]', 'click', function () {
      var start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(19, 0, 0, 0);
      N.pages.eventModal({
        defaults: { type: 'session', groupId: group.id, start: start.toISOString(), title: group.name + ' session' }
      });
    });

    var composer = root.querySelector('.nm-composer');
    if (composer) {
      var linkToggle = composer.querySelector('[data-composer-link-toggle]');
      var linkBox = composer.querySelector('.nm-composer-link');
      linkToggle.addEventListener('click', function () {
        ns.linkOpen = linkBox.hidden;
        linkToggle.classList.toggle('is-active', !linkBox.hidden);
        linkBox.hidden = !linkBox.hidden;
      });
      var requestToggle = composer.querySelector('[data-composer-request]');
      if (requestToggle) {
        requestToggle.addEventListener('click', function () {
          captureDraft();
          ns.mode = ns.mode === 'request' ? 'note' : 'request';
          repaint();
        });
      }
      var post = composer.querySelector('[data-note-post]');
      function publish() {
        var titleEl = composer.querySelector('[data-note-title]');
        var bodyEl = composer.querySelector('[data-note-body]');
        var linkLabel = composer.querySelector('[data-link-label]');
        var linkUrl = composer.querySelector('[data-link-url]');
        var topicSel = composer.querySelector('#np-topic');
        var topicId = topicSel ? (topicSel.value || null) : null;
        var isRequest = ns.mode === 'request';
        var isLink = !isRequest && !linkBox.hidden && linkUrl.value.trim();
        if (!titleEl.value.trim() && !bodyEl.value.trim() && !isLink && !isRequest) {
          bodyEl.focus();
          return;
        }
        if (isRequest && !titleEl.value.trim()) {
          ui.toast('Say what you are looking for', { kind: 'danger' });
          titleEl.focus();
          return;
        }
        var title = titleEl.value.trim() || (isLink ? (linkLabel.value.trim() || U.domainOf(linkUrl.value)) : U.truncate(U.plain(bodyEl.value), 48));
        N.store.createNote({
          scope: 'group', groupId: group.id, topicId: topicId,
          type: isRequest ? 'request' : (isLink ? 'link' : 'note'),
          title: title,
          body: bodyEl.value.trim(),
          url: isLink ? linkUrl.value.trim() : null
        });
        ns.draft = { title: '', body: '', linkLabel: '', linkUrl: '' };
        ns.linkOpen = false;
        ui.toast(isRequest ? 'Request posted — the group can answer it' : 'Posted to ' + group.name, {
          kind: 'success', icon: isRequest ? 'fa-circle-question' : 'fa-paper-plane'
        });
      }
      post.addEventListener('click', publish);
      composer.querySelector('[data-note-body]').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) publish();
      });
    }
    U.delegate(root, '[data-note-menu]', 'click', function (e, btn) {
      var note = N.store.noteById(btn.getAttribute('data-note-menu'));
      if (!note) return;
      ui.menu(btn, [
        { label: 'Edit note', icon: 'fa-pen', onClick: function () {
          ui.modal({
            title: 'Edit note', size: 'md',
            body: '<div class="nm-form">' +
              ui.field({ label: 'Title', id: 'en-title', value: note.title, class: 'nm-field--full' }) +
              ui.field({ label: 'Body', id: 'en-body', type: 'textarea', rows: 6, value: note.body, class: 'nm-field--full' }) +
              '</div>',
            actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Save note', variant: 'primary', onClick: function (close, panel) {
              N.store.updateNote(note.id, { title: panel.querySelector('#en-title').value.trim() || note.title, body: panel.querySelector('#en-body').value });
              ui.toast('Note updated', { kind: 'success' });
            } }]
          });
        } },
        { label: 'Copy link', icon: 'fa-link', onClick: function () {
          U.copy(window.location.href.split('#')[0] + '#/groups/' + group.id + '?tab=notes').then(function () {
            ui.toast('Link copied', { kind: 'success' });
          });
        } },
        { label: 'Delete note', icon: 'fa-trash', danger: true, onClick: function () {
          ui.confirm({ title: 'Delete this note?', message: '“' + note.title + '” will be removed for everyone.', confirmLabel: 'Delete', variant: 'danger' })
            .then(function (ok) { if (ok) { N.store.deleteNote(note.id); ui.toast('Note deleted', { kind: 'info' }); } });
        } }
      ]);
    });

    /* members */
    U.delegate(root, '[data-member-add]', 'click', function () {
      var input = root.querySelector('[data-member-email]');
      var res = N.store.addMemberByEmail(group.id, input.value);
      if (!res.ok) { ui.toast(res.error, { kind: 'danger' }); return; }
      ui.toast(res.user.name + ' added', { kind: 'success', icon: 'fa-user-plus' });
      input.value = '';
    });
    var memberInput = root.querySelector('[data-member-email]');
    if (memberInput) memberInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') root.querySelector('[data-member-add]').click();
    });
    U.delegate(root, '[data-copy-invite]', 'click', function () {
      U.copy(inviteUrl(group.inviteCode)).then(function (ok) {
        ui.toast(ok ? 'Invite link copied' : 'Copy failed — code is ' + group.inviteCode, { kind: ok ? 'success' : 'danger' });
      });
    });
    U.delegate(root, '[data-member-remove]', 'click', function (e, btn) {
      var userId = btn.getAttribute('data-member-remove');
      var user = N.store.userById(userId);
      var open = N.store.openTasksFor(userId).filter(function (t) { return t.groupId === group.id; });
      var others = N.store.membersOf(group.id).filter(function (m) { return m.id !== userId; });
      ui.modal({
        title: 'Remove ' + (user ? user.name : 'member') + '?',
        size: 'sm',
        body: '<p class="nm-body-text">' + (open.length
          ? 'They still have ' + open.length + ' open task' + (open.length === 1 ? '' : 's') + ' in this group. Hand those to someone else?'
          : 'They have no open tasks in this group.') + '</p>' +
          (open.length ? '<div class="nm-field"><label class="nm-label" for="reassign">Reassign their tasks to</label>' +
            '<select class="nm-select" id="reassign"><option value="">Leave unassigned</option>' +
            others.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.name) + '</option>'; }).join('') +
            '</select></div>' : ''),
        actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Remove member', variant: 'danger', onClick: function (close, panel) {
          var select = panel.querySelector('#reassign');
          N.store.removeMember(group.id, userId, select ? select.value : null);
          ui.toast((user ? user.name : 'Member') + ' removed', { kind: 'info' });
        } }]
      });
    });
  }

  N.router.add('/groups/:id', render, {
    title: function (ctx) {
      var g = N.store.groupById(ctx.params.id);
      return g ? g.name : 'Group';
    }
  });
})();
