/* Neoma — one note: read, edit, share. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  N.pages = N.pages || {};

  function wordCount(text) {
    var t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function render(ctx, root) {
    var note = N.store.noteById(ctx.params.id);
    if (!note) {
      root.innerHTML = '<div class="nm-page">' + ui.empty({
        icon: 'fa-circle-question', title: 'That item is gone',
        body: 'It may have been deleted from your notes.', actionLabel: 'Back to notes'
      }) + '</div>';
      U.delegate(root, '[data-empty-action]', 'click', function () { N.router.go('/vault'); });
      return;
    }

    var isFile = !!note.fileId || !!note.demo;
    var meta = ui.noteType(note.type);
    var group = N.store.groupById(note.groupId);
    var folder = N.store.folderById(note.folderId);

    root.innerHTML = '<div class="nm-page nm-page--note">' +
      '<div class="nm-note-top">' +
        '<a class="nm-backlink" href="#/vault">' + ui.icon('fa-arrow-left') + 'Notes</a>' +
        '<div class="nm-note-topactions">' +
          '<span class="nm-savestate nm-mono" data-savestate aria-live="polite"></span>' +
          '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-share>' + ui.icon('fa-share-nodes') + 'Share to group</button>' +
          ui.iconButton('fa-ellipsis', 'Item actions', { attrs: ' data-note-page-menu' }) +
        '</div>' +
      '</div>' +
      '<div class="nm-note-layout">' +
        '<div class="nm-note-main">' +
          '<div class="nm-note-chips">' + ui.noteTypeChip(note.type) +
            (group ? ui.groupPill(group) : (folder ? '<span class="nm-chip nm-chip--sm nm-mk-' + esc(folder.color) + '"><span class="nm-dot"></span>' + esc(folder.name) + '</span>' : '')) +
            '<span class="nm-mono nm-meta" data-wordcount></span>' +
          '</div>' +
          '<input class="nm-note-titleinput" data-note-title value="' + esc(note.title) + '" aria-label="Title">' +
          (isFile
            ? '<figure class="nm-preview" data-preview="' + esc(note.id) + '"><span class="nm-thumb-ph">' + ui.icon(meta.icon) + ' loading preview…</span></figure>'
            : '') +
          (note.type === 'link' && note.url
            ? '<div class="nm-linkcard"><span class="nm-linkcard-icon">' + ui.icon('fa-arrow-up-right-from-square') + '</span>' +
              '<div class="nm-linkcard-bd"><p class="nm-linkcard-label">' + esc(note.title) + '</p>' +
              '<p class="nm-mono nm-linkcard-url">' + esc(note.url) + '</p></div>' +
              '<a class="nm-btn nm-btn--secondary nm-btn--sm" href="' + esc(note.url) + '" target="_blank" rel="noopener">Open link</a></div>'
            : '') +
          '<label class="nm-label" for="note-body">' + (isFile ? 'Your notes on this file' : 'Notes') + '</label>' +
          '<textarea class="nm-textarea nm-note-body" id="note-body" data-note-body rows="14" placeholder="Write it out in your own words — that is what makes it stick.">' + esc(note.body) + '</textarea>' +
          '<p class="nm-help">Plain text. Line breaks are preserved. Everything saves automatically to this browser.</p>' +
        '</div>' +
        '<aside class="nm-note-side">' +
          ui.card(
            '<div class="nm-field"><label class="nm-label" for="note-folder">Subject</label>' +
              '<select class="nm-select" id="note-folder" data-note-folder>' +
                '<option value="">No subject</option>' +
                N.store.state.folders.map(function (f) { return '<option value="' + esc(f.id) + '"' + (note.folderId === f.id ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('') +
              '</select></div>' +
            '<div class="nm-field"><label class="nm-label" for="note-tags">Tags</label>' +
              '<input class="nm-input" id="note-tags" data-note-tags value="' + esc((note.tags || []).join(', ')) + '" placeholder="exam, lab, week 3">' +
              '<p class="nm-help">Comma separated.</p></div>' +
            (isFile
              ? '<div class="nm-field"><span class="nm-label">File</span>' +
                '<p class="nm-body-text nm-mono">' + esc(note.fileName || (note.demo ? 'demo preview' : 'stored locally')) +
                (note.fileSize ? ' · ' + N.pages.fmtBytes(note.fileSize) : '') + '</p>' +
                '<div class="nm-inline-actions">' +
                  (note.fileId ? '<button type="button" class="nm-btn nm-btn--secondary nm-btn--sm" data-open-file>Open file</button>' +
                    '<button type="button" class="nm-btn nm-btn--ghost nm-btn--sm" data-download-file>Download</button>' : '') +
                '</div></div>'
              : '') +
            (note.pinned ? '<p class="nm-help">' + ui.icon('fa-thumbtack') + ' Pinned to the top of your notes.</p>' : ''),
            { title: 'Details' }) +
          ui.card('<p class="nm-meta nm-mono">Created ' + esc(U.fmtDateTime(note.createdAt)) + '</p>' +
            '<p class="nm-meta nm-mono">Updated ' + esc(U.fmtRelative(note.updatedAt)) + '</p>' +
            (note.createdBy && note.createdBy !== N.store.state.session.userId ? '<p class="nm-meta">Shared by ' + esc(N.store.userName(note.createdBy)) + '</p>' : '') +
            '<button type="button" class="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm" data-delete>' + ui.icon('fa-trash') + 'Delete item</button>',
            { title: 'History' }) +
        '</aside>' +
      '</div></div>';

    /* ---------- preview ---------- */
    var previewEl = root.querySelector('[data-preview]');
    if (previewEl) {
      if (note.fileId) {
        N.files.urlFor(note.fileId).then(function (url) {
          if (!url || !previewEl.isConnected) {
            if (previewEl.isConnected) previewEl.innerHTML = '<span class="nm-thumb-ph">' + ui.icon(meta.icon) + ' Preview unavailable</span>';
            return;
          }
          if (/^image\//.test(note.fileType || '')) previewEl.innerHTML = '<img src="' + url + '" alt="Preview of ' + esc(note.title) + '">';
          else previewEl.innerHTML = '<object class="nm-preview-frame" data="' + url + '" type="' + esc(note.fileType) + '"><span class="nm-thumb-ph">' +
            ui.icon('fa-file') + ' Open the file to view it</span></object>';
        });
      } else if (note.demo) {
        previewEl.innerHTML = '<img src="' + N.files.demoPreview(note.demo, note.id) + '" alt="Preview of ' + esc(note.title) + '">';
      }
    }

    /* ---------- autosave ---------- */
    var saveState = root.querySelector('[data-savestate]');
    var titleInput = root.querySelector('[data-note-title]');
    var bodyInput = root.querySelector('[data-note-body]');
    var tagsInput = root.querySelector('[data-note-tags]');
    var wordEl = root.querySelector('[data-wordcount]');

    function updateWords() {
      var wc = wordCount(bodyInput.value);
      wordEl.textContent = wc + ' word' + (wc === 1 ? '' : 's');
    }
    function flashSaved() {
      saveState.textContent = 'Saved ' + U.fmtTime(new Date());
      saveState.classList.add('is-saved');
      setTimeout(function () { saveState.classList.remove('is-saved'); }, 1200);
    }
    var save = U.debounce(saveNow, 700);
    function saveNow() {
      N.store.updateNote(note.id, {
        title: titleInput.value.trim() || 'Untitled',
        body: bodyInput.value,
        tags: N.pages.parseTags(tagsInput.value)
      });
      flashSaved();
    }

    titleInput.addEventListener('input', save);
    bodyInput.addEventListener('input', function () { updateWords(); save(); });
    tagsInput.addEventListener('input', save);
    updateWords();
    bodyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = bodyInput.selectionStart;
        bodyInput.value = bodyInput.value.slice(0, start) + '  ' + bodyInput.value.slice(bodyInput.selectionEnd);
        bodyInput.selectionStart = bodyInput.selectionEnd = start + 2;
        bodyInput.dispatchEvent(new Event('input'));
      }
    });

    root.querySelector('[data-note-folder]').addEventListener('change', function (e) {
      N.store.updateNote(note.id, { folderId: e.target.value || null });
      flashSaved();
    });


    /* ---------- file actions ---------- */
    var openBtn = root.querySelector('[data-open-file]');
    if (openBtn) openBtn.addEventListener('click', function () {
      N.files.urlFor(note.fileId).then(function (url) {
        if (url) window.open(url, '_blank', 'noopener');
        else ui.toast('File is not available on this device', { kind: 'danger' });
      });
    });
    var dlBtn = root.querySelector('[data-download-file]');
    if (dlBtn) dlBtn.addEventListener('click', function () {
      N.files.get(note.fileId).then(function (rec) {
        if (!rec || !rec.blob) { ui.toast('File is not available on this device', { kind: 'danger' }); return; }
        U.download(rec.name || note.fileName || 'neoma-file', rec.blob, rec.type || 'application/octet-stream');
      });
    });

    /* ---------- page menu + share ---------- */
    root.querySelector('[data-note-page-menu]').addEventListener('click', function (e) {
      N.pages.noteMenu(e.currentTarget, N.store.noteById(note.id));
    });
    root.querySelector('[data-share]').addEventListener('click', function () {
      var groups = N.store.state.groups;
      if (!groups.length) {
        ui.toast('No groups to share with yet', { kind: 'danger', body: 'Create a group first, then share notes into it.' });
        return;
      }
      ui.modal({
        title: 'Share to a group',
        subtitle: 'This copies the note into the group’s shared notes. Study groups file it under a topic.',
        size: 'sm',
        body: '<div class="nm-field"><label class="nm-label" for="share-group">Group</label><select class="nm-select" id="share-group">' +
          groups.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.name) + (g.kind === 'study' ? ' · study group' : '') + '</option>'; }).join('') + '</select></div>' +
          '<div data-share-topic></div>' +
          '<p class="nm-help">Edits after sharing are separate — your copy stays yours.</p>',
        actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Share', variant: 'primary', onClick: function (close, panel) {
          var groupId = panel.querySelector('#share-group').value;
          var topicSel = panel.querySelector('#share-topic');
          var topicId = topicSel ? (topicSel.value || null) : null;
          var g = N.store.groupById(groupId);
          N.store.createNote({
            scope: 'group', groupId: groupId, topicId: topicId, type: 'note',
            title: note.title,
            body: bodyInput.value + (note.type === 'link' && note.url ? '\n\nLink: ' + note.url : ''),
            tags: N.pages.parseTags(tagsInput.value)
          });
          ui.toast('Shared to ' + (g ? g.name : 'the group'), {
            kind: 'success', icon: 'fa-share-nodes', actionLabel: 'View',
            onAction: function () { N.router.go('/groups/' + groupId + '?tab=notes'); }
          });
        } }],
        onMount: function (panel) {
          var groupSel = panel.querySelector('#share-group');
          var topicBox = panel.querySelector('[data-share-topic]');
          function paintTopics() {
            var g = N.store.groupById(groupSel.value);
            if (!g || !g.topics || !g.topics.length) { topicBox.innerHTML = ''; return; }
            topicBox.innerHTML = '<div class="nm-field"><label class="nm-label" for="share-topic">Topic</label>' +
              '<select class="nm-select" id="share-topic"><option value="">General</option>' +
              g.topics.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('') +
              '</select></div>';
          }
          paintTopics();
          groupSel.addEventListener('change', paintTopics);
        }
      });
    });
    root.querySelector('[data-delete]').addEventListener('click', function () {
      ui.confirm({
        title: 'Delete “' + note.title + '”?',
        message: note.scope === 'group' ? 'This removes the shared note for everyone in the group.' : 'This removes it from your notes.',
        confirmLabel: 'Delete item', variant: 'danger'
      }).then(function (ok) {
        if (!ok) return;
        if (note.fileId) { N.files.remove(note.fileId); N.files.remove(note.fileId + ':thumb'); }
        N.store.deleteNote(note.id);
        ui.toast('Deleted', { kind: 'info' });
        N.router.go(note.scope === 'group' ? '/groups/' + note.groupId + '?tab=notes' : '/vault');
      });
    });

    ctx.onCleanup(function () { saveNow(); });
  }

  N.router.add('/vault/:id', render, {
    manual: true,
    title: function (ctx) {
      var n = N.store.noteById(ctx.params.id);
      return n ? n.title : 'Note';
    }
  });
})();
