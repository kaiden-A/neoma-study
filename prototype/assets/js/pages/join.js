/* Neoma — invite landing page (#/join/CODE). */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  N.pages = N.pages || {};

  function render(ctx, root) {
    var code = String(ctx.params.code || '').toUpperCase();
    var group = null;
    for (var i = 0; i < N.store.state.groups.length; i++) {
      if (N.store.state.groups[i].inviteCode.toUpperCase() === code) group = N.store.state.groups[i];
    }

    if (!group) {
      root.innerHTML = '<div class="nm-page nm-page--join">' +
        ui.empty({
          icon: 'fa-link-slash', title: 'That invite link is not valid',
          body: 'Check the code with whoever sent it — it looks like <span class="nm-mono">CAP-8F3K</span>.',
          actionLabel: 'Go to your groups'
        }) + '</div>';
      U.delegate(root, '[data-empty-action]', 'click', function () { N.router.go('/groups'); });
      return;
    }

    var already = N.store.isMember(group.id);
    var members = N.store.membersOf(group.id);
    var isStudy = group.kind === 'study';
    var stats = N.store.groupStats(group.id);
    var study = isStudy ? N.store.studyStats(group.id) : null;
    var owner = N.store.userById(group.ownerId);
    var benefits = isStudy
      ? [
          { icon: 'fa-note-sticky', title: 'Shared notes by topic', body: 'Everyone files what they have under ' + (study.topics.length ? study.topics.map(function (t) { return t.name; }).join(', ') : 'the group topics') + '.' },
          { icon: 'fa-circle-question', title: 'Ask for what you are missing', body: 'Post a request — “anyone have week 5’s slides?” — and someone answers with a link.' },
          { icon: 'fa-book-open-reader', title: 'Study sessions on your calendar', body: 'Group study nights land in the same calendar as your deadlines.' }
        ]
      : [
          { icon: 'fa-list-check', title: 'Shared task board', body: 'Deadlines with reminders, assigned to whoever owns them.' },
          { icon: 'fa-note-sticky', title: 'Group notes', body: 'Minutes, drive links and feedback in one thread.' },
          { icon: 'fa-calendar-days', title: 'One calendar', body: 'Their deadlines drop into your calendar automatically.' }
        ];

    root.innerHTML = '<div class="nm-page nm-page--join">' +
      '<div class="nm-join nm-mk-' + esc(group.color) + '">' +
        '<span class="nm-join-bar"></span>' +
        '<div class="nm-join-bd">' +
          '<p class="nm-eyebrow">' + (isStudy ? 'Study group invite' : 'Group invite') + (owner ? ' from ' + esc(owner.name) : '') + '</p>' +
          '<div class="nm-join-chips">' +
            '<span class="nm-chip nm-chip--sm nm-chip--muted">' + ui.icon(isStudy ? 'fa-note-sticky' : 'fa-list-check') + (isStudy ? 'Study group' : 'Project group') + '</span>' +
            (group.subject ? ui.markerChip(group.subject, group.color, { small: true }) : '') +
            '<span class="nm-chip nm-chip--sm nm-chip--muted">' + ui.icon('fa-user-group') + members.length + ' member' + (members.length === 1 ? '' : 's') + '</span>' +
            (isStudy
              ? '<span class="nm-chip nm-chip--sm nm-chip--muted">' + ui.icon('fa-note-sticky') + study.notes + ' shared note' + (study.notes === 1 ? '' : 's') + '</span>'
              : '<span class="nm-chip nm-chip--sm nm-chip--muted">' + ui.icon('fa-list-check') + stats.open + ' open task' + (stats.open === 1 ? '' : 's') + '</span>') +
          '</div>' +
          '<h1 class="nm-title" id="page-title">' + esc(group.name) + '</h1>' +
          '<p class="nm-meta">' + esc(group.description || 'No description yet.') + '</p>' +
          '<div class="nm-join-what">' +
            benefits.map(function (b) {
              return '<div class="nm-join-item">' + ui.icon(b.icon) + '<div><strong>' + esc(b.title) + '</strong><span>' + esc(b.body) + '</span></div></div>';
            }).join('') +
          '</div>' +
          '<div class="nm-join-members"><p class="nm-label">Already in</p><div class="nm-avatars nm-avatars--wrap">' +
            members.map(function (m) { return ui.avatar(m, 34); }).join('') + '</div></div>' +
          '<div class="nm-join-actions">' +
            (already
              ? '<a class="nm-btn nm-btn--primary" href="#/groups/' + esc(group.id) + '">You are in — open the group</a>'
              : '<button type="button" class="nm-btn nm-btn--primary" data-join-now>' + ui.icon('fa-user-plus') + 'Join ' + esc(group.name) + '</button>') +
            '<a class="nm-btn nm-btn--ghost" href="#/groups">Not now</a>' +
          '</div>' +
          '<p class="nm-help">Joining adds you to the member list and puts their deadlines in your Today view. You can leave later from the Members tab.</p>' +
        '</div>' +
      '</div></div>';

    U.delegate(root, '[data-join-now]', 'click', function () {
      var res = N.store.joinGroup(group.id);
      if (!res.ok) { ui.toast(res.error, { kind: 'danger' }); return; }
      ui.toast('You joined ' + group.name, { kind: 'success', icon: 'fa-user-plus' });
      N.router.go('/groups/' + group.id);
    });
  }

  N.router.add('/join/:code', render, { title: function () { return 'Join group'; } });
})();
