/* Neoma — Notes: subjects, typed notes, uploads and links, all searchable. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util, ui = N.ui, esc = U.escapeHtml;
  N.pages = N.pages || {};

  var FILE_TYPES = ['handwritten', 'slides', 'paper'];
  var FILTERS = [
    { id: 'all', label: 'Everything', icon: 'fa-layer-group' },
    { id: 'notes', label: 'Notes', icon: 'fa-note-sticky', marker: 'amber' },
    { id: 'files', label: 'Files', icon: 'fa-paperclip', marker: 'sky' },
    { id: 'links', label: 'Links', icon: 'fa-link', marker: 'mint' }
  ];
  function matchesFilter(note, filter) {
    if (filter === 'notes') return note.type === 'note';
    if (filter === 'files') return FILE_TYPES.indexOf(note.type) !== -1;
    if (filter === 'links') return note.type === 'link';
    return true;
  }
  function countFor(notes, filter) {
    return notes.filter(function (n) { return matchesFilter(n, filter); }).length;
  }

  function typeFromFile(file) {
    var name = (file.name || '').toLowerCase();
    if (/^image\//.test(file.type)) return 'handwritten';
    if (name.indexOf('slide') !== -1 || name.indexOf('lecture') !== -1 || name.indexOf('deck') !== -1) return 'slides';
    if (/\.(ppt|pptx|key)$/.test(name)) return 'slides';
    if (name.indexOf('past') !== -1 || name.indexOf('paper') !== -1 || name.indexOf('exam') !== -1 || name.indexOf('midterm') !== -1) return 'paper';
    return 'paper';
  }
  function parseTags(value) {
    return String(value || '').split(',').map(function (t) { return t.trim().replace(/^#/, ''); }).filter(Boolean);
  }
  function fmtBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ---------- add-item modal ---------- */
  N.pages.addItemModal = function (opts) {
    opts = opts || {};
    var mode = 'note';
    var folders = N.store.state.folders;
    var pickedFile = null;

    function folderField() {
      return ui.field({
        label: 'Subject', id: 'ai-folder', type: 'select', class: 'nm-field--full',
        options: folders.map(function (f) { return { value: f.id, label: f.name }; }),
        value: opts.folderId || (folders[0] ? folders[0].id : '')
      });
    }
    function bodyFor(m) {
      if (m === 'note') {
        return '<div class="nm-form">' +
          ui.field({ label: 'Title', id: 'ai-title', placeholder: 'e.g. Big-O cheat sheet', class: 'nm-field--full' }) +
          ui.field({ label: 'Your notes', id: 'ai-body', type: 'textarea', rows: 8, placeholder: 'Write freely — plain text, one thought per line.', class: 'nm-field--full' }) +
          folderField() +
          ui.field({ label: 'Tags', id: 'ai-tags', placeholder: 'exam, complexity', help: 'Comma separated. Tags are searchable and filterable.', class: 'nm-field--full' }) +
          '</div>';
      }
      if (m === 'upload') {
        return '<div class="nm-form">' +
          '<div class="nm-field nm-field--full"><label class="nm-label" for="ai-file">File</label>' +
            '<input class="nm-input nm-file" id="ai-file" type="file" accept="image/*,.pdf,.ppt,.pptx,.doc,.docx,.txt">' +
            '<p class="nm-help">Photos of handwritten notes are compressed automatically. Files up to 15 MB stay on this device in IndexedDB.</p>' +
            '<p class="nm-help" data-file-info></p></div>' +
          ui.field({ label: 'Title', id: 'ai-title', placeholder: 'Leave blank to use the file name', class: 'nm-field--full' }) +
          ui.field({
            label: 'What is it?', id: 'ai-type', type: 'select', class: '',
            options: [
              { value: 'handwritten', label: 'Handwritten notes (photo)' },
              { value: 'slides', label: 'Presentation slides' },
              { value: 'paper', label: 'Question paper / past paper' },
              { value: 'note', label: 'Typed document' }
            ]
          }) +
          folderField() +
          ui.field({ label: 'Tags', id: 'ai-tags', placeholder: 'exam, practice', class: 'nm-field--full' }) +
          '</div>';
      }
      return '<div class="nm-form">' +
        ui.field({ label: 'Link', id: 'ai-url', type: 'url', placeholder: 'https://…', class: 'nm-field--full' }) +
        ui.field({ label: 'Title', id: 'ai-title', placeholder: 'e.g. Khan Academy — Recursion', class: 'nm-field--full' }) +
        ui.field({ label: 'Why it matters', id: 'ai-body', type: 'textarea', rows: 3, placeholder: 'Two lines so future-you remembers why you saved it.', class: 'nm-field--full' }) +
        folderField() +
        ui.field({ label: 'Tags', id: 'ai-tags', placeholder: 'video', class: 'nm-field--full' }) +
        '</div>';
    }

    var m = ui.modal({
      title: 'Add to your notes',
      subtitle: 'Notes, photos, slides, past papers and links — all searchable in one place.',
      size: 'lg',
      body: '<div class="nm-seg nm-seg--wide" role="tablist" aria-label="Item type">' +
          '<button type="button" role="tab" class="nm-seg-btn is-active" data-mode="note">' + ui.icon('fa-pen') + 'Write a note</button>' +
          '<button type="button" role="tab" class="nm-seg-btn" data-mode="upload">' + ui.icon('fa-arrow-up-from-bracket') + 'Upload a file</button>' +
          '<button type="button" role="tab" class="nm-seg-btn" data-mode="link">' + ui.icon('fa-link') + 'Save a link</button>' +
        '</div><div data-mode-body>' + bodyFor('note') + '</div>',
      footerHtml: '<span class="nm-spacer"></span>' +
        '<button type="button" class="nm-btn nm-btn--ghost" data-cancel>Cancel</button>' +
        '<button type="button" class="nm-btn nm-btn--primary" data-save>Save</button>',
      onMount: function (panel, close) {
        function bind() {
          var fileInput = panel.querySelector('#ai-file');
          if (fileInput) {
            fileInput.addEventListener('change', function () {
              pickedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
              var info = panel.querySelector('[data-file-info]');
              if (pickedFile) {
                info.textContent = pickedFile.name + ' · ' + fmtBytes(pickedFile.size);
                var typeSelect = panel.querySelector('#ai-type');
                if (typeSelect) typeSelect.value = typeFromFile(pickedFile);
                var title = panel.querySelector('#ai-title');
                if (title && !title.value) title.value = pickedFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
              } else if (info) info.textContent = '';
            });
          }
        }
        bind();
        U.qsa('[data-mode]', panel).forEach(function (btn) {
          btn.addEventListener('click', function () {
            mode = btn.getAttribute('data-mode');
            U.qsa('[data-mode]', panel).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
            panel.querySelector('[data-mode-body]').innerHTML = bodyFor(mode);
            pickedFile = null;
            bind();
            var first = panel.querySelector('.nm-modal-bd input, .nm-modal-bd textarea');
            if (first) first.focus();
          });
        });
        panel.querySelector('[data-cancel]').addEventListener('click', close);
        panel.querySelector('[data-save]').addEventListener('click', function () {
          var title = panel.querySelector('#ai-title');
          var body = panel.querySelector('#ai-body');
          var folder = panel.querySelector('#ai-folder');
          var tags = parseTags(panel.querySelector('#ai-tags') ? panel.querySelector('#ai-tags').value : '');
          var folderId = folder ? folder.value : null;

          if (mode === 'upload') {
            if (!pickedFile) {
              ui.toast('Choose a file first', { kind: 'danger' });
              return;
            }
            if (pickedFile.size > N.files.maxBytes) {
              ui.toast('That file is over 15 MB', { kind: 'danger', body: 'Keep big decks in Drive and save a link instead.' });
              return;
            }
            var saveBtn = panel.querySelector('[data-save]');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
            var type = panel.querySelector('#ai-type').value;
            var fileId = U.uid('file');
            var isImage = /^image\//.test(pickedFile.type);
            var prep = isImage ? N.files.compressImage(pickedFile) : Promise.resolve({ full: pickedFile, thumb: null });
            prep.then(function (res) {
              var meta = { name: pickedFile.name, type: pickedFile.type, size: pickedFile.size, createdAt: new Date().toISOString() };
              return N.files.put(fileId, res.full, meta).then(function () {
                return res.thumb ? N.files.put(fileId + ':thumb', res.thumb, meta) : null;
              });
            }).then(function () {
              var note = N.store.createNote({
                type: type, title: title.value.trim() || pickedFile.name,
                body: body ? body.value.trim() : '', folderId: folderId, tags: tags,
                fileId: fileId, fileName: pickedFile.name, fileType: pickedFile.type, fileSize: pickedFile.size
              });
              ui.toast('Saved to your notes', { kind: 'success', icon: 'fa-arrow-up-from-bracket', actionLabel: 'Open', onAction: function () { N.router.go('/vault/' + note.id); } });
              close();
            }).catch(function (err) {
              saveBtn.disabled = false;
              saveBtn.textContent = 'Save';
              ui.toast('Could not store that file', { kind: 'danger', body: err && err.message ? err.message : 'Browser storage refused it.' });
            });
            return;
          }

          if (mode === 'link') {
            var url = panel.querySelector('#ai-url').value.trim();
            if (!/^https?:\/\//i.test(url)) {
              ui.toast('Links need to start with http:// or https://', { kind: 'danger' });
              return;
            }
            var linkNote = N.store.createNote({
              type: 'link', url: url,
              title: title.value.trim() || U.domainOf(url),
              body: body ? body.value.trim() : '', folderId: folderId, tags: tags
            });
            ui.toast('Link saved', { kind: 'success', icon: 'fa-link', actionLabel: 'Open', onAction: function () { N.router.go('/vault/' + linkNote.id); } });
            close();
            return;
          }

          if (!title.value.trim() && !(body && body.value.trim())) {
            ui.toast('Write something first', { kind: 'danger' });
            var field = title.closest('.nm-field');
            field.classList.add('has-error');
            var err = field.querySelector('[data-error-for]');
            err.textContent = 'A title or some notes, so future-you knows what this is.';
            err.hidden = false;
            title.focus();
            return;
          }
          var note = N.store.createNote({
            type: 'note',
            title: title.value.trim() || U.truncate(U.plain(body.value), 48),
            body: body ? body.value : '', folderId: folderId, tags: tags
          });
          ui.toast('Note saved', { kind: 'success', icon: 'fa-note-sticky', actionLabel: 'Open', onAction: function () { N.router.go('/vault/' + note.id); } });
          close();
        });
        panel.querySelector('#ai-title').focus();
      }
    });
    return m;
  };

  /* ---------- item actions (grid + editor) ---------- */
  N.pages.noteMenu = function (anchor, note) {
    var group = N.store.groupById(note.groupId);
    ui.menu(anchor, [
      { label: 'Open', icon: 'fa-arrow-up-right-from-square', onClick: function () { N.router.go('/vault/' + note.id); } },
      { label: note.pinned ? 'Unpin' : 'Pin to top', icon: 'fa-thumbtack', onClick: function () { N.store.updateNote(note.id, { pinned: !note.pinned }); } },
      { label: 'Rename', icon: 'fa-pen', onClick: function () {
        ui.prompt({ title: 'Rename item', label: 'Title', value: note.title, confirmLabel: 'Rename' }).then(function (v) {
          if (v && v.trim()) N.store.updateNote(note.id, { title: v.trim() });
        });
      } },
      { sep: true },
      { label: 'Delete', icon: 'fa-trash', danger: true, onClick: function () {
        ui.confirm({ title: 'Delete “' + note.title + '”?', message: 'This removes it from your notes' + (group ? ' (it is not a shared group note)' : '') + '.', confirmLabel: 'Delete', variant: 'danger' })
          .then(function (ok) {
            if (!ok) return;
            if (note.fileId) { N.files.remove(note.fileId); N.files.remove(note.fileId + ':thumb'); }
            N.store.deleteNote(note.id);
            ui.toast('Deleted', { kind: 'info' });
            if (N.router.current().path.indexOf('vault/') === 0) N.router.go('/vault');
          });
      } }
    ]);
  };
  N.pages.fmtBytes = fmtBytes;
  N.pages.parseTags = parseTags;

  /* ---------- notes page ---------- */
  function render(ctx, root) {
    var state = {
      q: '',
      folderId: ctx.query.folder || 'all',
      filter: 'all'
    };
    var unsub = null;

    root.innerHTML = '<div class="nm-page nm-page--vault">' +
      ui.pageHead({
        eyebrow: 'Notes · <span class="nm-mono">' + N.store.personalNotes().length + ' items</span>',
        title: 'Your study notes',
        meta: 'Typed notes, photos of your handwriting, slide decks, past papers and links — all searchable, all yours.',
        actions: '<button type="button" class="nm-btn nm-btn--primary" data-add-item>' + ui.icon('fa-plus') + 'Add</button>'
      }) +
      '<div class="nm-vault-layout">' +
        '<aside class="nm-vault-side" data-sidebar></aside>' +
        '<div class="nm-vault-main">' +
          '<div class="nm-vault-toolbar">' +
            '<div class="nm-search"><span class="nm-search-icon">' + ui.icon('fa-magnifying-glass') + '</span>' +
              '<input class="nm-input nm-search-input" data-vault-search placeholder="Search titles, notes and tags…" aria-label="Search notes"></div>' +
            '<div class="nm-filterchips" data-filters></div>' +
          '</div>' +
          '<div data-list></div>' +
        '</div>' +
      '</div>' +
      '</div>';

    var listEl = root.querySelector('[data-list]');
    var sideEl = root.querySelector('[data-sidebar]');
    var filtersEl = root.querySelector('[data-filters]');
    var searchInput = root.querySelector('[data-vault-search]');

    function visibleNotes() {
      var notes = N.store.personalNotes();
      if (state.folderId !== 'all') notes = notes.filter(function (n) { return n.folderId === state.folderId; });
      notes = notes.filter(function (n) { return matchesFilter(n, state.filter); });
      if (state.q) {
        notes = notes.filter(function (n) {
          return U.match(n.title, state.q) || U.match(n.body, state.q) || (n.tags || []).some(function (t) { return U.match(t, state.q); });
        });
      }
      var sorted = U.sortBy(notes, function (n) { return n.updatedAt; }, 'desc');
      return sorted.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
    }

    function renderSidebar() {
      var notes = N.store.personalNotes();
      sideEl.innerHTML =
        '<nav class="nm-vault-nav" aria-label="Subjects">' +
          '<button type="button" class="nm-folders' + (state.folderId === 'all' ? ' is-active' : '') + '" data-nav="all">' +
            ui.icon('fa-layer-group') + '<span>All notes</span><span class="nm-mono nm-folder-count">' + notes.length + '</span></button>' +
          N.store.state.folders.map(function (f) {
            var count = notes.filter(function (n) { return n.folderId === f.id; }).length;
            return '<div class="nm-folderrow' + (state.folderId === f.id ? ' is-active' : '') + '">' +
              '<button type="button" class="nm-folders" data-nav="' + esc(f.id) + '">' +
                '<span class="nm-dot nm-mk-' + esc(f.color) + '"></span><span>' + esc(f.name) + '</span><span class="nm-mono nm-folder-count">' + count + '</span></button>' +
              ui.iconButton('fa-ellipsis', 'Subject options', { class: 'nm-iconbtn--sm', attrs: ' data-folder-menu="' + esc(f.id) + '"' }) +
              '</div>';
          }).join('') +
          '<button type="button" class="nm-folders nm-folders--add" data-new-folder>' + ui.icon('fa-plus') + '<span>New subject</span></button>' +
        '</nav>';
    }

    function renderFilters() {
      var notes = N.store.personalNotes();
      filtersEl.innerHTML = FILTERS.map(function (f) {
        return '<button type="button" class="nm-chip nm-chip--sm nm-chip--link' + (f.marker ? ' nm-mk-' + f.marker : '') + (state.filter === f.id ? ' is-active' : '') + '" data-filter="' + f.id + '">' +
          ui.icon(f.icon) + esc(f.label) + '<span class="nm-mono">' + countFor(notes, f.id) + '</span></button>';
      }).join('');
    }

    function renderList() {
      var notes = visibleNotes();
      var folder = state.folderId !== 'all' ? N.store.folderById(state.folderId) : null;
      var heading = folder ? folder.name : 'All notes';
      if (!notes.length) {
        listEl.innerHTML = ui.empty({
          icon: state.q ? 'fa-magnifying-glass' : 'fa-note-sticky',
          title: state.q ? 'No matches for “' + esc(state.q) + '”' : (folder ? 'Nothing in ' + esc(folder.name) + ' yet' : 'No notes here yet'),
          body: state.q ? 'Try a tag, a subject name, or a word from the notes.' : 'Write a note, photograph your handwriting, or drop in a slide deck or past paper.',
          actionLabel: 'Add something'
        });
        return;
      }
      listEl.innerHTML = '<div class="nm-vault-head"><h2 class="nm-section-title">' + esc(heading) + '</h2>' +
        '<span class="nm-mono nm-meta">' + notes.length + ' item' + (notes.length === 1 ? '' : 's') + '</span></div>' +
        '<div class="nm-notegrid">' + notes.map(function (n) { return ui.noteCard(n); }).join('') + '</div>';
      N.ui.hydrateThumbs(listEl);
    }

    function refresh() {
      renderSidebar();
      renderFilters();
      renderList();
    }
    function addItem() {
      N.pages.addItemModal({ folderId: state.folderId !== 'all' ? state.folderId : null });
    }

    /* wiring */
    searchInput.addEventListener('input', U.debounce(function () { state.q = searchInput.value; renderList(); }, 140));
    root.querySelector('[data-add-item]').addEventListener('click', addItem);
    U.delegate(root, '[data-empty-action]', 'click', addItem);
    U.delegate(root, '[data-nav]', 'click', function (e, btn) {
      state.folderId = btn.getAttribute('data-nav');
      refresh();
    });
    U.delegate(root, '[data-filter]', 'click', function (e, btn) {
      state.filter = btn.getAttribute('data-filter');
      refresh();
    });
    U.delegate(root, '[data-note]', 'click', function (e, card) {
      var menuBtn = e.target.closest('[data-note-menu]');
      var note = N.store.noteById(card.getAttribute('data-note'));
      if (!note) return;
      if (menuBtn) { N.pages.noteMenu(menuBtn, note); return; }
      if (e.target.closest('a')) return;
      N.router.go('/vault/' + note.id);
    });
    U.delegate(root, '[data-folder-menu]', 'click', function (e, btn) {
      e.stopPropagation();
      var folder = N.store.folderById(btn.getAttribute('data-folder-menu'));
      if (!folder) return;
      ui.menu(btn, [
        { label: 'Rename subject', icon: 'fa-pen', onClick: function () {
          ui.prompt({ title: 'Rename subject', label: 'Name', value: folder.name, confirmLabel: 'Rename' }).then(function (v) {
            if (v && v.trim()) N.store.renameFolder(folder.id, v.trim());
          });
        } },
        { label: 'Delete subject', icon: 'fa-trash', danger: true, onClick: function () {
          var others = N.store.state.folders.filter(function (f) { return f.id !== folder.id; });
          ui.modal({
            title: 'Delete “' + folder.name + '”?',
            size: 'sm',
            body: '<p class="nm-body-text">Items inside are kept. Choose where they should go:</p>' +
              '<div class="nm-field"><label class="nm-label" for="move-to">Move items to</label><select class="nm-select" id="move-to"><option value="">No subject</option>' +
              others.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>'; }).join('') + '</select></div>',
            actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Delete subject', variant: 'danger', onClick: function (close, panel) {
              N.store.deleteFolder(folder.id, panel.querySelector('#move-to').value || null);
              if (state.folderId === folder.id) state.folderId = 'all';
              ui.toast('Subject deleted', { kind: 'info' });
            } }]
          });
        } }
      ]);
    });
    U.delegate(root, '[data-new-folder]', 'click', function () {
      ui.modal({
        title: 'New subject',
        size: 'sm',
        body: '<div class="nm-form">' +
          ui.field({ label: 'Subject name', id: 'nf-name', placeholder: 'e.g. Thermodynamics', class: 'nm-field--full' }) +
          '<div class="nm-field nm-field--full"><span class="nm-label">Colour</span><div class="nm-swatches">' +
            U.MARKERS.map(function (m, i) {
              return '<label class="nm-swatch nm-mk-' + m.key + (i === 0 ? ' is-selected' : '') + '"><input type="radio" name="nf-color" value="' + m.key + '"' + (i === 0 ? ' checked' : '') + '>' +
                '<span class="nm-swatch-dot"></span><span class="nm-sr">' + m.label + '</span></label>';
            }).join('') + '</div></div></div>',
        actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Create subject', variant: 'primary', onClick: function (close, panel) {
          var name = panel.querySelector('#nf-name').value.trim();
          if (!name) { panel.querySelector('#nf-name').focus(); return; }
          var color = panel.querySelector('input[name="nf-color"]:checked');
          N.store.createFolder(name, color ? color.value : 'amber');
          ui.toast('Subject created', { kind: 'success' });
        } }],
        onMount: function (panel) {
          panel.querySelector('#nf-name').focus();
          U.qsa('input[name="nf-color"]', panel).forEach(function (r) {
            r.addEventListener('change', function () {
              U.qsa('.nm-swatch', panel).forEach(function (s) { s.classList.remove('is-selected'); });
              r.closest('.nm-swatch').classList.add('is-selected');
            });
          });
        }
      });
    });

    refresh();
    unsub = N.store.on(function () { refresh(); });
    ctx.onCleanup(function () { if (unsub) unsub(); });
  }

  N.router.add('/vault', render, { manual: true, title: function () { return 'Notes'; } });
})();
