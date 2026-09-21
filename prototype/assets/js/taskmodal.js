/* Neoma — create/edit a task (shared by dashboard, group board and palette). */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;

  function subRow(sub) {
    return '<li class="nm-subrow" data-sub="' + esc(sub.id) + '">' +
      '<label class="nm-check"><input type="checkbox"' + (sub.done ? ' checked' : '') + ' data-sub-toggle><span>' + esc(sub.title) + '</span></label>' +
      '<button type="button" class="nm-iconbtn nm-iconbtn--sm" data-sub-remove aria-label="Remove step">' + ui.icon('fa-xmark') + '</button>' +
      '</li>';
  }
  function linkRow(link) {
    return '<li class="nm-linkrow" data-link="' + esc(link.id) + '">' +
      ui.icon('fa-link') +
      '<span class="nm-linkrow-label">' + esc(link.label || U.domainOf(link.url)) + '</span>' +
      '<span class="nm-mono nm-linkrow-url">' + esc(U.truncate(link.url, 40)) + '</span>' +
      '<button type="button" class="nm-iconbtn nm-iconbtn--sm" data-link-remove aria-label="Remove link">' + ui.icon('fa-xmark') + '</button>' +
      '</li>';
  }

  function open(opts) {
    opts = opts || {};
    var editing = opts.task || null;
    var defaults = opts.defaults || {};
    var task = editing || {
      id: null, groupId: defaults.groupId || '', title: '', description: '',
      dueAt: defaults.dueAt || null, assigneeIds: defaults.assigneeIds || [],
      status: 'todo', priority: 'med', subtasks: [], links: []
    };
    var subtasks = (task.subtasks || []).map(function (s) { return Object.assign({}, s); });
    var links = (task.links || []).map(function (l) { return Object.assign({}, l); });
    var state = { groupId: task.groupId || '' };

    function memberBlock() {
      var members = state.groupId ? N.store.membersOf(state.groupId) : [];
      if (!members.length) {
        return '<p class="nm-help">' + (state.groupId ? 'No members yet — invite someone from the Members tab.' : 'Pick a group to assign this task to people.') + '</p>';
      }
      return '<div class="nm-checkgrid">' + members.map(function (m) {
        var checked = task.assigneeIds.indexOf(m.id) !== -1 ? ' checked' : '';
        return '<label class="nm-check nm-check--card"><input type="checkbox" value="' + esc(m.id) + '"' + checked + ' data-assignee>' +
          ui.avatar(m, 22) + '<span>' + esc(m.name) + (m.id === N.store.state.session.userId ? ' (you)' : '') + '</span></label>';
      }).join('') + '</div>';
    }

    function bodyHtml() {
      var groups = N.store.state.groups;
      return '' +
        '<div class="nm-form">' +
          ui.field({ label: 'Task', id: 'tm-title', value: task.title, placeholder: 'What needs doing?', required: true, class: 'nm-field--full' }) +
          ui.field({ label: 'Details', id: 'tm-desc', type: 'textarea', rows: 3, value: task.description, placeholder: 'Scope, links to the brief, acceptance notes…', class: 'nm-field--full' }) +
          '<div class="nm-form-grid">' +
            ui.field({ label: 'Due', id: 'tm-due', type: 'datetime-local', value: task.dueAt ? U.toInputValue(task.dueAt) : '' }) +
            ui.field({
              label: 'Priority', id: 'tm-priority', type: 'select', value: task.priority,
              options: N.store.PRIORITY.map(function (p) { return { value: p, label: N.store.PRIORITY_LABEL[p] }; })
            }) +
            ui.field({
              label: 'Status', id: 'tm-status', type: 'select', value: task.status,
              options: N.store.STATUS.map(function (s) { return { value: s, label: N.store.STATUS_LABEL[s] }; })
            }) +
            ui.field({
              label: 'Group', id: 'tm-group', type: 'select', value: state.groupId,
              options: [{ value: '', label: 'Personal task' }].concat(groups.map(function (g) { return { value: g.id, label: g.name + ' · ' + g.subject }; }))
            }) +
          '</div>' +
          '<div class="nm-field nm-field--full"><span class="nm-label">Assign to</span><div data-members>' + memberBlock() + '</div></div>' +
          '<div class="nm-field nm-field--full"><span class="nm-label">Checklist</span>' +
            '<ul class="nm-sublist" data-sublist>' + subtasks.map(subRow).join('') + '</ul>' +
            '<div class="nm-inline-add"><input class="nm-input" id="tm-subinput" placeholder="Add a step and press Enter" data-subinput>' +
            '<button type="button" class="nm-btn nm-btn--secondary" data-subadd>Add step</button></div>' +
          '</div>' +
          '<div class="nm-field nm-field--full"><span class="nm-label">Links</span>' +
            '<ul class="nm-linklist" data-linklist>' + links.map(linkRow).join('') + '</ul>' +
            '<div class="nm-inline-add">' +
              '<input class="nm-input" id="tm-linklabel" placeholder="Label" data-linklabel>' +
              '<input class="nm-input" id="tm-linkurl" placeholder="https://…" data-linkurl>' +
              '<button type="button" class="nm-btn nm-btn--secondary" data-linkadd>Attach link</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    var m = ui.modal({
      title: editing ? 'Edit task' : 'New task',
      subtitle: editing ? 'Created by ' + N.store.userName(task.createdBy) : 'Give it a due date so reminders can fire',
      size: 'lg',
      body: bodyHtml(),
      footerHtml: (editing ? '<button type="button" class="nm-btn nm-btn--danger nm-btn--ghost" data-delete>Delete task</button>' : '') +
        '<span class="nm-spacer"></span>' +
        '<button type="button" class="nm-btn nm-btn--ghost" data-cancel>Cancel</button>' +
        '<button type="button" class="nm-btn nm-btn--primary" data-save>' + (editing ? 'Save task' : 'Create task') + '</button>',
      onMount: function (panel, close) {
        var membersBox = panel.querySelector('[data-members]');
        panel.querySelector('#tm-group').addEventListener('change', function (e) {
          state.groupId = e.target.value;
          if (!state.groupId) task.assigneeIds = [];
          membersBox.innerHTML = memberBlock();
        });

        var sublist = panel.querySelector('[data-sublist]');
        function addSub() {
          var input = panel.querySelector('[data-subinput]');
          var title = input.value.trim();
          if (!title) return;
          subtasks.push({ id: U.uid('s'), title: title, done: false });
          sublist.innerHTML = subtasks.map(subRow).join('');
          input.value = '';
          input.focus();
        }
        panel.querySelector('[data-subadd]').addEventListener('click', addSub);
        panel.querySelector('[data-subinput]').addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); addSub(); }
        });
        sublist.addEventListener('click', function (e) {
          var remove = e.target.closest('[data-sub-remove]');
          if (remove) {
            var id = remove.closest('[data-sub]').getAttribute('data-sub');
            subtasks = subtasks.filter(function (s) { return s.id !== id; });
            sublist.innerHTML = subtasks.map(subRow).join('');
          }
        });
        sublist.addEventListener('change', function (e) {
          var toggle = e.target.closest('[data-sub-toggle]');
          if (!toggle) return;
          var id = toggle.closest('[data-sub]').getAttribute('data-sub');
          subtasks.forEach(function (s) { if (s.id === id) s.done = toggle.checked; });
        });

        var linklist = panel.querySelector('[data-linklist]');
        function addLink() {
          var label = panel.querySelector('[data-linklabel]');
          var url = panel.querySelector('[data-linkurl]');
          if (!url.value.trim()) return;
          links.push({ id: U.uid('tl'), label: label.value.trim() || U.domainOf(url.value), url: url.value.trim() });
          linklist.innerHTML = links.map(linkRow).join('');
          label.value = '';
          url.value = '';
          url.focus();
        }
        panel.querySelector('[data-linkadd]').addEventListener('click', addLink);
        panel.querySelector('[data-linkurl]').addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); addLink(); }
        });
        linklist.addEventListener('click', function (e) {
          var remove = e.target.closest('[data-link-remove]');
          if (remove) {
            var id = remove.closest('[data-link]').getAttribute('data-link');
            links = links.filter(function (l) { return l.id !== id; });
            linklist.innerHTML = links.map(linkRow).join('');
          }
        });

        var deleteBtn = panel.querySelector('[data-delete]');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', function () {
            ui.confirm({
              title: 'Delete this task?',
              message: '“' + task.title + '” will be removed from the board and from everyone’s deadlines.',
              confirmLabel: 'Delete task', variant: 'danger'
            }).then(function (ok) {
              if (!ok) return;
              N.store.deleteTask(task.id);
              close();
              ui.toast('Task deleted', { kind: 'info' });
            });
          });
        }

        panel.querySelector('[data-cancel]').addEventListener('click', close);
        panel.querySelector('[data-save]').addEventListener('click', function () {
          var title = panel.querySelector('#tm-title');
          var titleField = title.closest('.nm-field');
          if (!title.value.trim()) {
            titleField.classList.add('has-error');
            var err = titleField.querySelector('[data-error-for]');
            err.textContent = 'Give the task a name so people know what it is.';
            err.hidden = false;
            title.focus();
            return;
          }
          var assignees = U.qsa('[data-assignee]:checked', panel).map(function (cb) { return cb.value; });
          var payload = {
            title: title.value.trim(),
            description: panel.querySelector('#tm-desc').value.trim(),
            dueAt: panel.querySelector('#tm-due').value ? U.fromInputValue(panel.querySelector('#tm-due').value).toISOString() : null,
            priority: panel.querySelector('#tm-priority').value,
            status: panel.querySelector('#tm-status').value,
            groupId: panel.querySelector('#tm-group').value || null,
            assigneeIds: assignees,
            subtasks: subtasks,
            links: links
          };
          if (editing) {
            var wasDone = task.status === 'done';
            N.store.updateTask(task.id, payload);
            if (payload.status === 'done' && !wasDone) {
              ui.toast('Nice — task closed', { kind: 'success', icon: 'fa-check' });
            } else {
              ui.toast('Task updated', { kind: 'success' });
            }
          } else {
            N.store.createTask(payload);
            ui.toast('Task created', { kind: 'success', icon: 'fa-plus' });
          }
          close();
        });
      }
    });
    return m;
  }

  N.taskModal = { open: open };
})();
