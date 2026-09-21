/* Neoma — UI primitives: icons, chips, modals, menus, toasts, page furniture. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util;
  var esc = U.escapeHtml;

  var overlayEl = null;
  function overlays() {
    if (!overlayEl) overlayEl = document.getElementById('overlays') || document.body;
    return overlayEl;
  }

  var ui = {};

  /* ---------- icons ---------- */
  ui.icon = function (name, extra) {
    var cls = name.indexOf('fa-') === 0 && name.split(' ').length === 1 ? 'fa-solid ' + name : name;
    return '<i class="' + cls + (extra ? ' ' + extra : '') + '" aria-hidden="true"></i>';
  };

  /* ---------- marker / chip helpers ---------- */
  ui.markerChip = function (label, colorKey, opts) {
    opts = opts || {};
    return '<span class="nm-chip nm-chip--mark nm-mk-' + esc(colorKey || 'amber') + (opts.small ? ' nm-chip--sm' : '') + '">' +
      (opts.dot !== false ? '<span class="nm-dot"></span>' : '') + esc(label) + '</span>';
  };
  ui.chip = function (label, opts) {
    opts = opts || {};
    return '<span class="nm-chip' + (opts.tone ? ' nm-chip--' + opts.tone : '') + (opts.small ? ' nm-chip--sm' : '') + '">' +
      (opts.icon ? ui.icon(opts.icon) : '') + esc(label) + '</span>';
  };
  ui.priorityChip = function (p) {
    var tone = p === 'high' ? 'danger' : (p === 'med' ? 'warn' : 'muted');
    return '<span class="nm-chip nm-chip--' + tone + ' nm-chip--sm" title="Priority: ' + esc(N.store.PRIORITY_LABEL[p] || p) + '">' +
      ui.icon(p === 'high' ? 'fa-angles-up' : (p === 'med' ? 'fa-equals' : 'fa-angle-down')) + esc(N.store.PRIORITY_LABEL[p] || p) + '</span>';
  };
  ui.statusChip = function (s) {
    var tone = s === 'done' ? 'ok' : (s === 'doing' ? 'info' : 'muted');
    var icon = s === 'done' ? 'fa-check' : (s === 'doing' ? 'fa-play' : 'fa-circle');
    return '<span class="nm-chip nm-chip--' + tone + ' nm-chip--sm">' + ui.icon(icon) + esc(N.store.STATUS_LABEL[s] || s) + '</span>';
  };
  ui.dial = function (dueAt, done, opts) { return U.dial(dueAt, done, opts); };

  /* ---------- note + event vocabulary ---------- */
  var NOTE_TYPES = {
    note: { label: 'Note', icon: 'fa-note-sticky', marker: 'amber' },
    handwritten: { label: 'Handwritten', icon: 'fa-pen-fancy', marker: 'violet' },
    slides: { label: 'Slides', icon: 'fa-file-powerpoint', marker: 'sky' },
    paper: { label: 'Question paper', icon: 'fa-file-lines', marker: 'coral' },
    link: { label: 'Link', icon: 'fa-link', marker: 'mint' },
    request: { label: 'Request', icon: 'fa-circle-question', marker: 'amber' }
  };
  ui.noteType = function (type) { return NOTE_TYPES[type] || NOTE_TYPES.note; };
  ui.noteTypeChip = function (type) {
    var m = ui.noteType(type);
    return '<span class="nm-chip nm-chip--sm nm-mk-' + m.marker + '">' + ui.icon(m.icon) + esc(m.label) + '</span>';
  };
  var EVENT_TYPES = {
    exam: { label: 'Exam', icon: 'fa-graduation-cap', marker: 'coral' },
    session: { label: 'Study session', icon: 'fa-book-open-reader', marker: 'violet' },
    meeting: { label: 'Meeting', icon: 'fa-people-group', marker: 'sky' },
    personal: { label: 'Personal', icon: 'fa-mug-hot', marker: 'amber' }
  };
  ui.eventType = function (type) { return EVENT_TYPES[type] || EVENT_TYPES.personal; };

  /* ---------- identity ---------- */
  ui.avatar = function (user, size) {
    if (!user) return '';
    var s = size || 28;
    var marker = U.marker(user.color);
    var invited = user.invited ? ' is-invited' : '';
    return '<span class="nm-avatar' + invited + '" style="--av-bg:' + marker.hex + ';width:' + s + 'px;height:' + s + 'px;font-size:' + Math.max(9, Math.round(s * 0.38)) + 'px" title="' +
      esc(user.name + (user.email ? ' · ' + user.email : '')) + '" role="img" aria-label="' + esc(user.name) + '">' + esc(U.initials(user.name)) + '</span>';
  };
  ui.avatarStack = function (users, max) {
    var list = users || [];
    var cap = max || 4;
    var shown = list.slice(0, cap);
    var extra = list.length - shown.length;
    return '<span class="nm-avatars">' + shown.map(function (u) { return ui.avatar(u, 26); }).join('') +
      (extra > 0 ? '<span class="nm-avatar nm-avatar--more" title="' + extra + ' more">+' + extra + '</span>' : '') + '</span>';
  };
  ui.groupPill = function (group, opts) {
    if (!group) return '<span class="nm-chip nm-chip--sm nm-chip--muted">No group</span>';
    opts = opts || {};
    var m = U.marker(group.color);
    return '<a class="nm-chip nm-chip--sm nm-chip--link nm-mk-' + esc(group.color) + '" href="#/groups/' + esc(group.id) + '">' +
      '<span class="nm-dot"></span>' + esc(group.name) + '</a>';
  };

  /* ---------- layout furniture ---------- */
  ui.progress = function (pct, opts) {
    opts = opts || {};
    var p = U.clamp(pct || 0, 0, 100);
    return '<span class="nm-prog' + (opts.large ? ' nm-prog--lg' : '') + '" role="progressbar" aria-valuenow="' + p + '" aria-valuemin="0" aria-valuemax="100" aria-label="' +
      esc(opts.label || 'Progress') + '"><span class="nm-prog-bar' + (opts.marker ? ' nm-mk-' + esc(opts.marker) : '') + '" style="width:' + p + '%"></span></span>';
  };
  ui.pageHead = function (opts) {
    return '' +
      '<header class="nm-page-head">' +
        '<div class="nm-head-top">' +
          '<p class="nm-eyebrow">' + opts.eyebrow + '</p>' +
        '</div>' +
        '<div class="nm-head-row">' +
          '<h1 class="nm-title" id="page-title">' + opts.title + '</h1>' +
          (opts.actions ? '<div class="nm-head-actions">' + opts.actions + '</div>' : '') +
        '</div>' +
        (opts.meta ? '<p class="nm-meta">' + opts.meta + '</p>' : '') +
      '</header>';
  };
  ui.section = function (title, bodyHtml, opts) {
    opts = opts || {};
    return '<section class="nm-section' + (opts.class ? ' ' + opts.class : '') + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + '>' +
      (title || opts.actions ? '<div class="nm-section-head"><h2 class="nm-section-title">' + (title || '') + '</h2>' +
        (opts.actions ? '<div class="nm-section-actions">' + opts.actions + '</div>' : '') + '</div>' : '') +
      bodyHtml + '</section>';
  };
  ui.card = function (body, opts) {
    opts = opts || {};
    return '<div class="nm-card' + (opts.class ? ' ' + opts.class : '') + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + '>' +
      (opts.title ? '<div class="nm-card-hd"><h3 class="nm-card-title">' + opts.title + '</h3>' +
        (opts.actions ? '<div class="nm-card-actions">' + opts.actions + '</div>' : '') + '</div>' : '') +
      '<div class="nm-card-bd">' + body + '</div></div>';
  };
  ui.empty = function (opts) {
    return '<div class="nm-empty' + (opts.compact ? ' nm-empty--compact' : '') + '">' +
      '<span class="nm-empty-icon">' + ui.icon(opts.icon || 'fa-feather-pointed') + '</span>' +
      '<h3 class="nm-empty-title">' + opts.title + '</h3>' +
      (opts.body ? '<p class="nm-empty-body">' + opts.body + '</p>' : '') +
      (opts.actionLabel ? '<button type="button" class="nm-btn nm-btn--primary" data-empty-action>' + esc(opts.actionLabel) + '</button>' : '') +
      '</div>';
  };
  ui.relTime = function (iso, prefix) {
    return '<time class="nm-mono nm-time" datetime="' + esc(iso) + '" title="' + esc(U.fmtDateTime(iso)) + '">' + esc((prefix || '') + U.fmtRelative(iso)) + '</time>';
  };
  ui.tabs = function (items, activeId, baseUrl) {
    return '<nav class="nm-tabs" aria-label="Sections">' + items.map(function (it) {
      return '<a class="nm-tab' + (it.id === activeId ? ' is-active' : '') + '" href="' + baseUrl + (it.id === items[0].id ? '' : '?tab=' + it.id) + '"' +
        (it.id === activeId ? ' aria-current="page"' : '') + '>' + (it.icon ? ui.icon(it.icon) : '') + esc(it.label) +
        (it.count != null ? '<span class="nm-tab-count">' + it.count + '</span>' : '') + '</a>';
    }).join('') + '</nav>';
  };
  ui.field = function (opts) {
    var id = opts.id || U.uid('fld');
    var label = '<label class="nm-label" for="' + id + '">' + esc(opts.label) + (opts.required ? '<span class="nm-req" aria-hidden="true">*</span>' : '') + '</label>';
    var control;
    if (opts.type === 'textarea') {
      control = '<textarea class="nm-textarea" id="' + id + '" name="' + esc(opts.name || id) + '" rows="' + (opts.rows || 4) + '" placeholder="' +
        esc(opts.placeholder || '') + '"' + (opts.required ? ' required' : '') + '>' + esc(opts.value || '') + '</textarea>';
    } else if (opts.type === 'select') {
      control = '<select class="nm-select" id="' + id + '" name="' + esc(opts.name || id) + '">' +
        (opts.options || []).map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(opts.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select>';
    } else {
      control = '<input class="nm-input" id="' + id + '" name="' + esc(opts.name || id) + '" type="' + esc(opts.type || 'text') + '" value="' +
        esc(opts.value == null ? '' : opts.value) + '" placeholder="' + esc(opts.placeholder || '') + '"' +
        (opts.required ? ' required' : '') + (opts.min ? ' min="' + esc(opts.min) + '"' : '') + (opts.step ? ' step="' + esc(opts.step) + '"' : '') + '>';
    }
    return '<div class="nm-field' + (opts.class ? ' ' + opts.class : '') + '">' + label + control +
      (opts.help ? '<p class="nm-help">' + esc(opts.help) + '</p>' : '') +
      '<p class="nm-error" data-error-for="' + id + '" hidden></p></div>';
  };
  ui.iconButton = function (icon, label, opts) {
    opts = opts || {};
    return '<button type="button" class="nm-iconbtn' + (opts.class ? ' ' + opts.class : '') + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' +
      (opts.attrs || '') + '>' + ui.icon(icon) + '</button>';
  };
  ui.kbd = function (text) { return '<kbd class="nm-kbd">' + esc(text) + '</kbd>'; };
  ui.sr = function (text) { return '<span class="nm-sr">' + esc(text) + '</span>'; };

  /* ---------- toasts ---------- */
  ui.toast = function (message, opts) {
    opts = opts || {};
    var root = document.getElementById('toasts');
    if (!root) return;
    var el = U.node(
      '<div class="nm-toast nm-toast--' + (opts.kind || 'info') + '" role="status">' +
        '<span class="nm-toast-icon">' + ui.icon(opts.icon || (opts.kind === 'danger' ? 'fa-circle-exclamation' : (opts.kind === 'success' ? 'fa-check' : 'fa-moon'))) + '</span>' +
        '<div class="nm-toast-text"><p class="nm-toast-title">' + esc(message) + '</p>' +
        (opts.body ? '<p class="nm-toast-body">' + esc(opts.body) + '</p>' : '') + '</div>' +
        (opts.actionLabel ? '<button type="button" class="nm-toast-action">' + esc(opts.actionLabel) + '</button>' : '') +
        '<button type="button" class="nm-toast-close" aria-label="Dismiss">' + ui.icon('fa-xmark') + '</button>' +
      '</div>'
    );
    root.appendChild(el);
    while (root.children.length > 4) root.removeChild(root.firstChild);
    var timer = setTimeout(close, opts.timeout || 5000);
    function close() {
      clearTimeout(timer);
      if (!el.parentNode) return;
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 160);
    }
    el.querySelector('.nm-toast-close').addEventListener('click', close);
    if (opts.actionLabel && opts.onAction) {
      el.querySelector('.nm-toast-action').addEventListener('click', function () { opts.onAction(); close(); });
    }
    if (opts.route) {
      el.classList.add('is-clickable');
      el.addEventListener('click', function (e) {
        if (e.target.closest('.nm-toast-close') || e.target.closest('.nm-toast-action')) return;
        close();
        N.router.go(opts.route);
      });
    }
    return close;
  };

  /* ---------- modal ---------- */
  var openModals = [];
  ui.modal = function (opts) {
    var overlay = U.node('<div class="nm-overlay"></div>');
    var size = opts.size || 'md';
    var panel = U.node(
      '<div class="nm-modal nm-modal--' + size + '" role="dialog" aria-modal="true">' +
        '<div class="nm-modal-hd">' +
          '<div><h2 class="nm-modal-title" id="modal-title">' + esc(opts.title || '') + '</h2>' +
          (opts.subtitle ? '<p class="nm-modal-sub">' + esc(opts.subtitle) + '</p>' : '') + '</div>' +
          '<button type="button" class="nm-iconbtn" data-close aria-label="Close dialog">' + ui.icon('fa-xmark') + '</button>' +
        '</div>' +
        '<div class="nm-modal-bd"></div>' +
        (opts.footerHtml ? '<div class="nm-modal-ft">' + opts.footerHtml + '</div>' : '') +
      '</div>'
    );
    panel.setAttribute('aria-labelledby', 'modal-title');
    var body = panel.querySelector('.nm-modal-bd');
    if (opts.bodyNode) body.appendChild(opts.bodyNode);
    else body.innerHTML = opts.body || '';

    var footer = panel.querySelector('.nm-modal-ft');
    var actions = opts.actions || [];
    if (actions.length && !footer) {
      footer = U.node('<div class="nm-modal-ft"></div>');
      panel.appendChild(footer);
    }
    if (footer) {
      actions.forEach(function (a) {
        var btn = U.node('<button type="button" class="nm-btn nm-btn--' + (a.variant || 'ghost') + '">' + esc(a.label) + '</button>');
        btn.addEventListener('click', function () {
          if (a.onClick) {
            var result = a.onClick(close, panel);
            if (a.close !== false && result !== false) close();
          } else close();
        });
        footer.appendChild(btn);
      });
    }

    var previousFocus = document.activeElement;
    function close() {
      if (!overlay.parentNode) return;
      overlay.classList.add('is-leaving');
      var remove = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
      setTimeout(remove, 140);
      openModals = openModals.filter(function (m) { return m !== close; });
      if (!openModals.length) document.body.classList.remove('has-overlay');
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    }

    function onKey(e) {
      if (e.key === 'Escape' && opts.dismissible !== false) { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        var items = U.focusable(panel);
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    overlay.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay && opts.dismissible !== false) close(); });
    var closeBtn = panel.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (opts.dismissible === false && closeBtn) closeBtn.remove();

    overlay.appendChild(panel);
    overlays().appendChild(overlay);
    document.body.classList.add('has-overlay');
    openModals.push(close);
    if (opts.onMount) opts.onMount(panel, close);
    requestAnimationFrame(function () {
      var target = panel.querySelector('[autofocus]') || U.focusable(panel)[0] || panel;
      if (target.focus) target.focus();
    });
    return { close: close, panel: panel, overlay: overlay };
  };

  ui.confirm = function (opts) {
    return new Promise(function (resolve) {
      var m = ui.modal({
        title: opts.title || 'Are you sure?',
        subtitle: opts.subtitle,
        size: 'sm',
        body: '<p class="nm-body-text">' + (opts.html || esc(opts.message || '')) + '</p>',
        actions: [
          { label: opts.cancelLabel || 'Cancel', variant: 'ghost', onClick: function () { resolve(false); } },
          {
            label: opts.confirmLabel || 'Confirm', variant: opts.variant || 'primary',
            onClick: function () { resolve(true); }
          }
        ]
      });
      m.overlay.addEventListener('nm-closed', function () { resolve(false); });
    });
  };

  ui.prompt = function (opts) {
    return new Promise(function (resolve) {
      var fieldId = U.uid('pr');
      var input = opts.multiline
        ? '<textarea class="nm-textarea" id="' + fieldId + '" rows="' + (opts.rows || 4) + '" placeholder="' + esc(opts.placeholder || '') + '">' + esc(opts.value || '') + '</textarea>'
        : '<input class="nm-input" id="' + fieldId + '" type="text" value="' + esc(opts.value || '') + '" placeholder="' + esc(opts.placeholder || '') + '">';
      ui.modal({
        title: opts.title || 'Enter a value',
        subtitle: opts.subtitle,
        size: 'sm',
        body: (opts.label ? '<label class="nm-label" for="' + fieldId + '">' + esc(opts.label) + '</label>' : '') +
          input + (opts.help ? '<p class="nm-help">' + esc(opts.help) + '</p>' : ''),
        actions: [
          { label: 'Cancel', variant: 'ghost', onClick: function () { resolve(null); } },
          {
            label: opts.confirmLabel || 'Save', variant: 'primary',
            onClick: function (close, panel) {
              resolve(panel.querySelector('#' + fieldId).value);
            }
          }
        ],
        onMount: function (panel) {
          var el = panel.querySelector('#' + fieldId);
          el.focus();
          if (opts.multiline && opts.value) el.setSelectionRange(el.value.length, el.value.length);
          el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !opts.multiline) {
              e.preventDefault();
              resolve(el.value);
              var m = openModals[openModals.length - 1];
              if (m) m();
            }
          });
        }
      });
    });
  };

  /* ---------- context menu ---------- */
  var activeMenu = null;
  ui.closeMenu = function () {
    if (!activeMenu) return;
    activeMenu.remove();
    activeMenu = null;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onMenuKey, true);
    window.removeEventListener('resize', ui.closeMenu);
    window.removeEventListener('scroll', ui.closeMenu, true);
  };
  function onDocDown(e) { if (activeMenu && !activeMenu.contains(e.target)) ui.closeMenu(); }
  function onMenuKey(e) {
    if (!activeMenu) return;
    var items = U.qsa('.nm-menu-item:not([disabled])', activeMenu);
    var idx = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); ui.closeMenu(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (items[idx - 1] || items[items.length - 1]).focus(); }
  }
  ui.menu = function (anchor, items) {
    ui.closeMenu();
    var menu = U.node('<div class="nm-menu" role="menu"></div>');
    items.forEach(function (item) {
      if (!item) return;
      if (item.sep) { menu.appendChild(U.node('<div class="nm-menu-sep" role="separator"></div>')); return; }
      if (item.header) { menu.appendChild(U.node('<div class="nm-menu-hd">' + esc(item.header) + '</div>')); return; }
      var btn = U.node('<button type="button" class="nm-menu-item' + (item.danger ? ' is-danger' : '') + '" role="menuitem">' +
        (item.icon ? ui.icon(item.icon) : '') + '<span>' + esc(item.label) + '</span></button>');
      if (item.disabled) btn.setAttribute('disabled', '');
      btn.addEventListener('click', function () {
        ui.closeMenu();
        if (item.onClick) item.onClick();
      });
      menu.appendChild(btn);
    });
    overlays().appendChild(menu);
    var rect = anchor.getBoundingClientRect();
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var left = Math.min(rect.left, window.innerWidth - mw - 12);
    var top = rect.bottom + 6;
    if (top + mh > window.innerHeight - 12) top = Math.max(12, rect.top - mh - 6);
    menu.style.left = Math.max(12, left) + 'px';
    menu.style.top = top + 'px';
    activeMenu = menu;
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onMenuKey, true);
    window.addEventListener('resize', ui.closeMenu);
    window.addEventListener('scroll', ui.closeMenu, true);
    var first = menu.querySelector('.nm-menu-item:not([disabled])');
    if (first) first.focus();
    return menu;
  };

  /* ---------- shared row renderers ---------- */
  ui.taskRow = function (task, opts) {
    opts = opts || {};
    var group = N.store.groupById(task.groupId);
    var members = (task.assigneeIds || []).map(function (id) { return N.store.userById(id); }).filter(Boolean);
    var dueLabel = '';
    if (task.dueAt) {
      dueLabel = opts.timeOnly ? U.fmtTime(task.dueAt) : U.fmtDateTime(task.dueAt);
    }
    return '<li class="nm-task' + (task.status === 'done' ? ' is-done' : '') + '" data-task="' + esc(task.id) + '">' +
      '<button type="button" class="nm-task-check" data-task-toggle="' + esc(task.id) + '" aria-label="' +
        (task.status === 'done' ? 'Reopen' : 'Complete') + ' ' + esc(task.title) + '" role="checkbox" aria-checked="' + (task.status === 'done') + '">' +
        ui.icon('fa-check') + '</button>' +
      '<div class="nm-task-main">' +
        '<p class="nm-task-title"><span class="nm-task-text">' + esc(task.title) + '</span>' +
          (task.description ? '<span class="nm-task-note" title="Has a note">' + ui.icon('fa-align-left') + '</span>' : '') + '</p>' +
        '<p class="nm-task-meta">' +
          (group && !opts.hideGroup ? ui.groupPill(group) : '') +
          (dueLabel ? '<span class="nm-mono nm-time">' + esc(dueLabel) + '</span>' : '') +
          (task.priority === 'high' && task.status !== 'done' ? ui.priorityChip('high') : '') +
        '</p>' +
      '</div>' +
      '<div class="nm-task-side">' +
        (task.dueAt && opts.dial !== false ? ui.dial(task.dueAt, task.status === 'done', { showLabel: false }) : '') +
        (members.length ? ui.avatarStack(members, 3) : (opts.showUnassigned ? '<span class="nm-chip nm-chip--sm nm-chip--muted">Unassigned</span>' : '')) +
        (opts.menu ? ui.iconButton('fa-ellipsis', 'Task actions', { class: 'nm-iconbtn--sm', attrs: ' ' + opts.menu + '="' + esc(task.id) + '"' }) : '') +
      '</div>' +
      '</li>';
  };

  ui.noteCard = function (note, opts) {
    opts = opts || {};
    var meta = ui.noteType(note.type);
    var folder = N.store.folderById(note.folderId);
    var group = N.store.groupById(note.groupId);
    var thumb = '';
    if (note.type !== 'note' && note.type !== 'link') {
      thumb = '<div class="nm-notecard-thumb" data-thumb="' + esc(note.id) + '" aria-hidden="true"><span class="nm-thumb-ph">' + ui.icon(meta.icon) + '</span></div>';
    } else if (note.type === 'link') {
      thumb = '<div class="nm-notecard-thumb nm-notecard-thumb--link"><span class="nm-thumb-ph">' + ui.icon('fa-arrow-up-right-from-square') + '</span></div>';
    }
    return '<article class="nm-notecard" data-note="' + esc(note.id) + '">' +
      '<a class="nm-notecard-link" href="#/vault/' + esc(note.id) + '" aria-label="Open ' + esc(note.title) + '">' + thumb + '</a>' +
      '<div class="nm-notecard-bd">' +
        '<div class="nm-notecard-top">' + ui.noteTypeChip(note.type) +
          (note.pinned ? '<span class="nm-chip nm-chip--sm nm-chip--muted" title="Pinned">' + ui.icon('fa-thumbtack') + 'Pinned</span>' : '') +
        '</div>' +
        '<h3 class="nm-notecard-title"><a href="#/vault/' + esc(note.id) + '">' + esc(note.title) + '</a></h3>' +
        '<p class="nm-notecard-body">' + esc(U.truncate(U.plain(note.body), opts.bodyLength || 120)) + '</p>' +
        '<div class="nm-notecard-ft">' +
          (group ? ui.groupPill(group) : (folder ? ui.markerChip(folder.name, folder.color, { small: true }) : '')) +
          (note.tags && note.tags.length ? '<span class="nm-tags">' + note.tags.slice(0, 3).map(function (t) { return '<span class="nm-tag">#' + esc(t) + '</span>'; }).join('') + '</span>' : '') +
          '<span class="nm-mono nm-time">' + esc(U.fmtRelative(note.updatedAt)) + '</span>' +
        '</div>' +
      '</div>' +
      '</article>';
  };

  /* hydrate note thumbnails + file previews after a render */
  ui.hydrateThumbs = function (root) {
    U.qsa('[data-thumb]', root || document).forEach(function (el) {
      var note = N.store.noteById(el.getAttribute('data-thumb'));
      if (!note) return;
      if (note.fileId) {
        N.files.thumbUrlFor(note.fileId).then(function (url) {
          if (!url || !el.isConnected) return;
          el.innerHTML = '<img src="' + url + '" alt="">';
          el.classList.add('is-loaded');
        });
      } else if (note.demo) {
        el.innerHTML = '<img src="' + N.files.demoPreview(note.demo, note.id) + '" alt="">';
        el.classList.add('is-loaded');
      }
    });
    U.qsa('[data-preview]', root || document).forEach(function (el) {
      var note = N.store.noteById(el.getAttribute('data-preview'));
      if (!note) return;
      var show = function (url) {
        if (!url || !el.isConnected) return;
        el.innerHTML = note.type === 'paper' || note.type === 'slides' || note.type === 'handwritten'
          ? '<img src="' + url + '" alt="Preview of ' + esc(note.title) + '">'
          : '';
        el.classList.add('is-loaded');
      };
      if (note.fileId) N.files.urlFor(note.fileId).then(show);
      else if (note.demo) show(N.files.demoPreview(note.demo, note.id));
    });
  };

  N.ui = ui;
})();
