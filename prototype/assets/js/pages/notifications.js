/* Neoma — notification centre. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  var H = U.MS.hour, D = U.MS.day;

  function row(item) {
    var read = N.notify.isRead(item);
    return '<li class="nm-notif' + (read ? ' is-read' : '') + ' nm-notif--' + esc(item.tone) + '" data-notif="' + esc(item.id) + '">' +
      '<span class="nm-notif-icon">' + ui.icon(item.icon) + '</span>' +
      '<div class="nm-notif-bd">' +
        '<p class="nm-notif-title">' + esc(item.title) + (read ? '' : '<span class="nm-unread-dot" aria-label="Unread"></span>') + '</p>' +
        '<p class="nm-notif-text">' + esc(item.body) + '</p>' +
        '<p class="nm-notif-meta">' + ui.relTime(item.at) + '</p>' +
      '</div>' +
      '<div class="nm-notif-actions">' +
        '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-notif-open="' + esc(item.id) + '">Open</button>' +
        '<button type="button" class="nm-iconbtn nm-iconbtn--sm" aria-label="Snooze for an hour" title="Snooze 1 hour" data-notif-snooze="' + esc(item.id) + '" data-snooze-ms="' + H + '">' + ui.icon('fa-clock') + '</button>' +
        (read ? '' : '<button type="button" class="nm-iconbtn nm-iconbtn--sm" aria-label="Mark as read" title="Mark read" data-notif-read="' + esc(item.id) + '">' + ui.icon('fa-check') + '</button>') +
      '</div></li>';
  }

  function render(ctx, root) {
    var items = N.notify.derive();
    var unread = items.filter(function (i) { return !N.notify.isRead(i); });
    var groups = U.groupBy(items, function (i) { return i.group; });
    var order = N.notify.GROUP_ORDER.filter(function (g) { return groups[g] && groups[g].length; });

    root.innerHTML = '<div class="nm-page">' +
      ui.pageHead({
        eyebrow: 'Notifications · <span class="nm-mono">' + unread.length + ' unread</span>',
        title: 'What needs your attention',
        meta: 'Derived from your own deadlines: nothing is sent anywhere, Neoma just watches the dates.',
        actions: (unread.length ? '<button type="button" class="nm-btn nm-btn--secondary" data-read-all>' + ui.icon('fa-check-double') + 'Mark all read</button>' : '') +
          '<a class="nm-btn nm-btn--ghost" href="#/settings">' + ui.icon('fa-sliders') + 'Notification settings</a>'
      }) +
      (items.length
        ? order.map(function (g) {
            var list = U.sortBy(groups[g], function (i) { return i.at; });
            return ui.section(N.notify.groupLabel(g) + ' <span class="nm-chip nm-chip--sm nm-chip--muted">' + list.length + '</span>',
              '<ul class="nm-notiflist">' + list.map(row).join('') + '</ul>');
          }).join('')
        : ui.empty({
            icon: 'fa-moon', title: 'All clear',
            body: 'No overdue work, nothing due inside your reminder window, and no revision cards waiting.',
            actionLabel: 'Back to Today'
          })) +
      '</div>';

    U.delegate(root, '[data-empty-action]', 'click', function () { N.router.go('/today'); });
    U.delegate(root, '[data-read-all]', 'click', function () {
      N.store.readAll(items.map(function (i) { return i.id; }));
      ui.toast('All caught up', { kind: 'success', icon: 'fa-check-double' });
    });
    U.delegate(root, '[data-notif-read]', 'click', function (e, btn) {
      N.store.readNotification(btn.getAttribute('data-notif-read'));
    });
    U.delegate(root, '[data-notif-snooze]', 'click', function (e, btn) {
      N.store.snoozeNotification(btn.getAttribute('data-notif-snooze'), Number(btn.getAttribute('data-snooze-ms')));
      ui.toast('Snoozed for ' + (Number(btn.getAttribute('data-snooze-ms')) / H) + ' hour(s)', { kind: 'info', icon: 'fa-clock' });
    });
    U.delegate(root, '[data-notif-open]', 'click', function (e, btn) {
      var item = null;
      items.forEach(function (i) { if (i.id === btn.getAttribute('data-notif-open')) item = i; });
      if (!item) return;
      N.store.readNotification(item.id);
      N.router.go(item.route);
    });
  }

  N.router.add('/notifications', render, { title: function () { return 'Notifications'; } });
})();
