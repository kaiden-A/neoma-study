/* Neoma — group list + create-group modal. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;

  function colorPicker(selected) {
    return '<div class="nm-swatches" role="radiogroup" aria-label="Group colour">' + U.MARKERS.map(function (m) {
      return '<label class="nm-swatch nm-mk-' + m.key + '" title="' + esc(m.label) + '">' +
        '<input type="radio" name="group-color" value="' + m.key + '"' + (m.key === selected ? ' checked' : '') + '>' +
        '<span class="nm-swatch-dot"></span><span class="nm-sr">' + esc(m.label) + '</span></label>';
    }).join('') + '</div>';
  }

  N.pages = N.pages || {};
  N.pages.newGroupModal = function (opts) {
    opts = opts || {};
    var kind = opts.kind === 'study' ? 'study' : 'project';

    function kindBody() {
      if (kind === 'study') {
        return '<div class="nm-form" data-kind-body>' +
          ui.field({ label: 'Group name', id: 'ng-name', placeholder: 'e.g. Finals crew — mixed units', required: true, class: 'nm-field--full' }) +
          ui.field({
            label: 'Topics', id: 'ng-topics', placeholder: 'CS301, CHEM210, MATH201',
            help: 'Comma separated. Members file shared notes under these, and can filter by them.', class: 'nm-field--full'
          }) +
          ui.field({ label: 'What is it for?', id: 'ng-desc', type: 'textarea', rows: 2, placeholder: 'Who is in it, what you trade, when you meet…', class: 'nm-field--full' }) +
          '<div class="nm-field nm-field--full"><span class="nm-label">Colour</span>' + colorPicker('violet') + '</div>' +
          '</div>';
      }
      return '<div class="nm-form" data-kind-body>' +
        ui.field({ label: 'Group name', id: 'ng-name', placeholder: 'e.g. Capstone — Sensor Dashboard', required: true, class: 'nm-field--full' }) +
        ui.field({ label: 'Subject / unit', id: 'ng-subject', placeholder: 'CS301', class: 'nm-field--full' }) +
        ui.field({ label: 'What is it for?', id: 'ng-desc', type: 'textarea', rows: 2, placeholder: 'Deadline, brief, what the group is delivering…', class: 'nm-field--full' }) +
        '<div class="nm-field nm-field--full"><span class="nm-label">Colour</span>' + colorPicker('sky') + '</div>' +
        '</div>';
    }

    function bindPicker(panel) {
      U.qsa('input[name="group-color"]', panel).forEach(function (radio) {
        radio.addEventListener('change', function () {
          U.qsa('input[name="group-color"]', panel).forEach(function (r) { r.closest('.nm-swatch').classList.toggle('is-selected', r.checked); });
        });
        radio.closest('.nm-swatch').classList.toggle('is-selected', radio.checked);
      });
    }

    ui.modal({
      title: 'New group',
      subtitle: 'A project group runs a task board. A study group trades notes and books sessions.',
      size: 'md',
      body: '<div class="nm-seg nm-seg--wide" role="tablist" aria-label="Group kind">' +
          '<button type="button" role="tab" class="nm-seg-btn' + (kind === 'project' ? ' is-active' : '') + '" data-kind="project">' + ui.icon('fa-list-check') + 'Project group</button>' +
          '<button type="button" role="tab" class="nm-seg-btn' + (kind === 'study' ? ' is-active' : '') + '" data-kind="study">' + ui.icon('fa-note-sticky') + 'Study group</button>' +
        '</div>' +
        '<p class="nm-help" data-kind-hint></p>' +
        kindBody(),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: 'Create group', variant: 'primary',
          onClick: function (close, panel) {
            var name = panel.querySelector('#ng-name');
            if (!name.value.trim()) {
              var field = name.closest('.nm-field');
              field.classList.add('has-error');
              var err = field.querySelector('[data-error-for]');
              err.textContent = 'Name the group so members recognise the invite.';
              err.hidden = false;
              name.focus();
              return false;
            }
            var colorRadio = panel.querySelector('input[name="group-color"]:checked');
            var subjectField = panel.querySelector('#ng-subject');
            var topicsField = panel.querySelector('#ng-topics');
            var group = N.store.createGroup({
              kind: kind,
              name: name.value,
              subject: subjectField ? subjectField.value : '',
              topics: topicsField ? topicsField.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [],
              description: panel.querySelector('#ng-desc').value,
              color: colorRadio ? colorRadio.value : (kind === 'study' ? 'violet' : 'sky')
            });
            ui.toast(kind === 'study' ? 'Study group created' : 'Group created', {
              kind: 'success', icon: kind === 'study' ? 'fa-note-sticky' : 'fa-users',
              body: kind === 'study' ? 'Share a note or invite the crew from Members.' : 'Invite members from the Members tab.'
            });
            N.router.go('/groups/' + group.id + (kind === 'study' ? '?tab=notes' : '?tab=members'));
          }
        }
      ],
      onMount: function (panel) {
        var hint = panel.querySelector('[data-kind-hint]');
        function paintHint() {
          hint.textContent = kind === 'study'
            ? 'Notes come first: shared subjects, note requests and study sessions.'
            : 'Tasks come first: a board, deadlines and reminders for the group.';
        }
        paintHint();
        bindPicker(panel);
        U.qsa('[data-kind]', panel).forEach(function (btn) {
          btn.addEventListener('click', function () {
            kind = btn.getAttribute('data-kind');
            U.qsa('[data-kind]', panel).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
            var current = panel.querySelector('[data-kind-body]');
            var fresh = U.node(kindBody());
            current.parentNode.replaceChild(fresh, current);
            paintHint();
            bindPicker(panel);
            panel.querySelector('#ng-name').focus();
          });
        });
        panel.querySelector('#ng-name').focus();
      }
    });
  };

  function joinCard() {
    return '<div class="nm-card nm-card--join">' +
      '<div class="nm-card-bd">' +
        '<span class="nm-join-icon">' + ui.icon('fa-link') + '</span>' +
        '<h3 class="nm-card-title">Have an invite link?</h3>' +
        '<p class="nm-body-text">Paste the code your group sent you — it looks like <span class="nm-mono">CAP-8F3K</span>.</p>' +
        '<div class="nm-inline-add">' +
          '<input class="nm-input" id="join-code" placeholder="Group code" aria-label="Group invite code">' +
          '<button type="button" class="nm-btn nm-btn--secondary" data-join>Open</button>' +
        '</div>' +
        '<p class="nm-error" data-join-error hidden></p>' +
      '</div></div>';
  }

  function groupCard(g) {
    var isStudy = g.kind === 'study';
    var members = N.store.membersOf(g.id);
    var stats = N.store.groupStats(g.id);
    var study = isStudy ? N.store.studyStats(g.id) : null;
    return '<a class="nm-groupcard nm-mk-' + esc(g.color) + '" href="#/groups/' + esc(g.id) + '">' +
      '<span class="nm-groupcard-bar"></span>' +
      '<div class="nm-groupcard-bd">' +
        '<div class="nm-groupcard-top">' +
          '<span class="nm-chip nm-chip--sm nm-chip--muted">' + ui.icon(isStudy ? 'fa-note-sticky' : 'fa-list-check') + (isStudy ? 'Study' : 'Project') + '</span>' +
          (g.subject ? ui.markerChip(g.subject, g.color, { small: true }) : '') +
          (isStudy && study.openRequests
            ? '<span class="nm-chip nm-chip--sm nm-chip--warn">' + ui.icon('fa-circle-question') + study.openRequests + ' request' + (study.openRequests === 1 ? '' : 's') + '</span>'
            : (!isStudy && stats.overdue ? '<span class="nm-chip nm-chip--sm nm-chip--danger">' + ui.icon('fa-circle-exclamation') + stats.overdue + ' overdue</span>' : '')) +
        '</div>' +
        '<h3 class="nm-groupcard-title">' + esc(g.name) + '</h3>' +
        '<p class="nm-groupcard-desc">' + esc(U.truncate(U.plain(g.description) || 'No description yet.', 96)) + '</p>' +
        '<div class="nm-groupcard-meta">' +
          (isStudy
            ? '<span class="nm-mono">' + study.notes + ' shared note' + (study.notes === 1 ? '' : 's') + '</span>' +
              '<span class="nm-mono">' + (study.topics.length || 0) + ' topic' + (study.topics.length === 1 ? '' : 's') + '</span>' +
              (study.nextSession ? '<span class="nm-mono">session ' + esc(U.fmtRelative(study.nextSession.start)) + '</span>' : '<span class="nm-mono">no session booked</span>')
            : '<span class="nm-mono">' + stats.total + ' tasks</span>' +
              '<span class="nm-mono">' + stats.done + ' done</span>' +
              (stats.next ? '<span class="nm-mono">next ' + esc(U.fmtRelative(stats.next.dueAt)) + '</span>' : '<span class="nm-mono">nothing open</span>')) +
        '</div>' +
        '<div class="nm-groupcard-ft">' +
          (isStudy
            ? '<div class="nm-groupcard-prog">' + (study.topics.length
                ? study.topics.slice(0, 4).map(function (t) { return ui.markerChip(t.name, t.color, { small: true }); }).join('')
                : '<span class="nm-mono nm-meta">no topics yet</span>') + '</div>'
            : '<div class="nm-groupcard-prog">' + ui.progress(stats.pct, { marker: g.color, label: g.name + ' progress' }) + '<span class="nm-mono">' + stats.pct + '%</span></div>') +
          ui.avatarStack(members, 4) +
        '</div>' +
      '</div></a>';
  }

  function render(ctx, root) {
    var groups = N.store.state.groups;
    root.innerHTML = '<div class="nm-page">' +
      ui.pageHead({
        eyebrow: 'Groups · <span class="nm-mono">' + groups.length + ' active</span>',
        title: 'Groups',
        meta: 'Project groups run a task board. Study groups trade notes and book sessions — invite by email or share the link.',
        actions: '<button type="button" class="nm-btn nm-btn--primary" data-new-group>' + ui.icon('fa-plus') + 'New group</button>'
      }) +
      (groups.length
        ? '<div class="nm-groupgrid">' + groups.map(groupCard).join('') + joinCard() + '</div>'
        : '<div class="nm-groupgrid">' + joinCard() + '</div>' +
          ui.empty({
            icon: 'fa-users', title: 'No groups yet',
            body: 'Start one for a unit, a lab team or a presentation crew. Invite by email or share the link.',
            actionLabel: 'Create your first group'
          })) +
      '</div>';

    U.delegate(root, '[data-new-group]', 'click', function () { N.pages.newGroupModal(); });
    U.delegate(root, '[data-empty-action]', 'click', function () { N.pages.newGroupModal(); });

    var codeInput = root.querySelector('#join-code');
    function tryJoin() {
      var code = (codeInput.value || '').trim().toUpperCase();
      if (!code) return;
      var group = null;
      for (var i = 0; i < N.store.state.groups.length; i++) {
        if (N.store.state.groups[i].inviteCode.toUpperCase() === code) group = N.store.state.groups[i];
      }
      var err = root.querySelector('[data-join-error]');
      if (!group) {
        err.textContent = 'No group matches that code. Check the link your group sent.';
        err.hidden = false;
        codeInput.focus();
        return;
      }
      err.hidden = true;
      N.router.go('/join/' + group.inviteCode);
    }
    U.delegate(root, '[data-join]', 'click', tryJoin);
    if (codeInput) codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryJoin(); });
  }

  N.router.add('/groups', render, { title: function () { return 'Groups'; } });
})();
