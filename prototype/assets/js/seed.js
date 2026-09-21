/* Neoma — demo semester seed data (dates are generated relative to today). */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util;
  var D = U.MS.day, H = U.MS.hour;

  function at(dayOffset, hour, minute) {
    var d = U.addDays(U.startOfDay(new Date()), dayOffset);
    d.setHours(hour == null ? 18 : hour, minute || 0, 0, 0);
    return d.toISOString();
  }

  N.seed = {
    build: function () {
      return {
        version: 1,
        session: { userId: 'u_me' },
        users: [
          { id: 'u_me', name: 'Kaiden A.', email: 'kaiden@student.edu', color: 'amber', program: 'BSc Computer Science · Year 3' },
          { id: 'u_maya', name: 'Maya Chen', email: 'maya.chen@student.edu', color: 'sky' },
          { id: 'u_dev', name: 'Dev Patel', email: 'dev.patel@student.edu', color: 'violet' },
          { id: 'u_sofia', name: 'Sofia Reyes', email: 'sofia.reyes@student.edu', color: 'pink' },
          { id: 'u_liam', name: "Liam O'Connor", email: 'liam.oconnor@student.edu', color: 'mint' },
          { id: 'u_aisha', name: 'Aisha Bello', email: 'aisha.bello@student.edu', color: 'coral' },
          { id: 'u_tom', name: 'Tom Nakamura', email: 'tom.nakamura@student.edu', color: 'sky' }
        ],
        groups: [
          {
            id: 'g_cap', name: 'Capstone — Sensor Dashboard', subject: 'CS301', color: 'sky',
            description: 'Wildlife audio sensor dashboard. Interim demo in week 6, final submission week 10.',
            inviteCode: 'CAP-8F3K', ownerId: 'u_me', memberIds: ['u_me', 'u_maya', 'u_dev', 'u_sofia'],
            createdAt: new Date(Date.now() - 21 * D).toISOString(),
            kind: 'project', topics: [],
            links: [
              { id: 'gl_1', label: 'Repo — neoma capstone', url: 'https://github.com/' },
              { id: 'gl_2', label: 'Project brief (PDF)', url: 'https://example.edu/cs301/brief' }
            ]
          },
          {
            id: 'g_deck', name: 'Market Entry Deck', subject: 'BUS220', color: 'coral',
            description: '12-slide recommendation for a market entry strategy. Rehearsal booked, prof wants two markets max.',
            inviteCode: 'DECK-2XQ7', ownerId: 'u_aisha', memberIds: ['u_me', 'u_aisha', 'u_tom'],
            createdAt: new Date(Date.now() - 12 * D).toISOString(),
            kind: 'project', topics: [],
            links: [{ id: 'gl_3', label: 'Shared slide template', url: 'https://slides.example.com/deck-4' }]
          },
          {
            id: 'g_lab', name: 'Spectrometry Lab Report', subject: 'CHEM210', color: 'mint',
            description: 'Formal lab report, 2500 words, includes error analysis and raw data appendix.',
            inviteCode: 'LAB-9PT4', ownerId: 'u_me', memberIds: ['u_me', 'u_liam'],
            createdAt: new Date(Date.now() - 6 * D).toISOString(),
            kind: 'project', topics: [],
            links: []
          },
          {
            id: 'g_study', kind: 'study', name: 'Finals crew — mixed units', subject: '', color: 'violet',
            description: 'Four of us across different degrees. We trade notes, ask for what we are missing and run a study night most weeks.',
            inviteCode: 'CREW-4MT9', ownerId: 'u_aisha', memberIds: ['u_me', 'u_aisha', 'u_liam', 'u_maya'],
            createdAt: new Date(Date.now() - 30 * D).toISOString(),
            topics: [
              { id: 'tp_cs', name: 'CS301', color: 'sky' },
              { id: 'tp_chem', name: 'CHEM210', color: 'mint' },
              { id: 'tp_math', name: 'MATH201', color: 'amber' }
            ],
            links: [{ id: 'gl_4', label: 'Shared drive — finals folder', url: 'https://drive.example.com/finals' }]
          }
        ],
        tasks: [
          { id: 't_1', groupId: 'g_cap', title: 'Literature review', description: 'Summarise 8 papers on acoustic monitoring.', dueAt: at(-9, 18), assigneeIds: ['u_maya'], status: 'done', priority: 'med', createdBy: 'u_me', completedAt: at(-9, 16), subtasks: [], links: [], createdAt: at(-14, 10) },
          { id: 't_2', groupId: 'g_cap', title: 'Data pipeline spike', description: 'Prototype the ingest → clean → feature step for one recording.', dueAt: at(2, 18), assigneeIds: ['u_me'], status: 'doing', priority: 'high', createdBy: 'u_maya', subtasks: [
            { id: 's_1', title: 'Normalise sample rate', done: true },
            { id: 's_2', title: 'Noise gate experiment', done: false },
            { id: 's_3', title: 'Write spike notes', done: false }
          ], links: [{ id: 'tl_1', label: 'Dataset docs', url: 'https://example.org/birdnet' }], createdAt: at(-8, 9) },
          { id: 't_3', groupId: 'g_cap', title: 'API schema doc', description: 'Agree the JSON shapes for detections and sites.', dueAt: at(5, 12), assigneeIds: ['u_maya', 'u_dev'], status: 'todo', priority: 'med', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-5, 11) },
          { id: 't_4', groupId: 'g_cap', title: 'Dashboard wireframes', description: 'Two screens: live detections, site history.', dueAt: at(9, 17), assigneeIds: ['u_sofia'], status: 'todo', priority: 'med', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-5, 12) },
          { id: 't_5', groupId: 'g_cap', title: 'Interim demo prep', description: 'Slides + live demo script for the week 6 review.', dueAt: at(16, 10), assigneeIds: ['u_dev', 'u_me'], status: 'todo', priority: 'low', createdBy: 'u_dev', subtasks: [], links: [], createdAt: at(-3, 15) },
          { id: 't_6', groupId: 'g_deck', title: 'Competitor matrix', description: 'Score 6 competitors on price, channel, regulation.', dueAt: at(-1, 17), assigneeIds: ['u_me'], status: 'doing', priority: 'high', createdBy: 'u_aisha', subtasks: [
            { id: 's_4', title: 'Collect pricing pages', done: true },
            { id: 's_5', title: 'Score regulation risk', done: false }
          ], links: [], createdAt: at(-7, 10) },
          { id: 't_7', groupId: 'g_deck', title: 'Survey results summary', description: 'Top 5 findings with charts for slides 4-6.', dueAt: at(0, 20), assigneeIds: ['u_aisha'], status: 'doing', priority: 'high', createdBy: 'u_aisha', subtasks: [], links: [], createdAt: at(-6, 14) },
          { id: 't_8', groupId: 'g_deck', title: 'Slide template + theme', description: 'Lock the visual theme so everyone can fill their slides.', dueAt: at(3, 18), assigneeIds: ['u_tom'], status: 'todo', priority: 'med', createdBy: 'u_aisha', subtasks: [], links: [], createdAt: at(-4, 16) },
          { id: 't_9', groupId: 'g_deck', title: 'Full rehearsal', description: 'Timed run-through with Q&A from the group.', dueAt: at(8, 15), assigneeIds: ['u_me', 'u_aisha', 'u_tom'], status: 'todo', priority: 'high', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-2, 9) },
          { id: 't_10', groupId: 'g_lab', title: 'Raw data cleanup', description: 'Remove blank runs, flag saturated peaks.', dueAt: at(6, 19), assigneeIds: ['u_liam'], status: 'todo', priority: 'med', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-5, 13) },
          { id: 't_11', groupId: 'g_lab', title: 'Error analysis section', description: 'Instrument error, dilution error, propagation.', dueAt: at(12, 18), assigneeIds: ['u_me'], status: 'todo', priority: 'high', createdBy: 'u_me', subtasks: [
            { id: 's_6', title: 'List error sources', done: true },
            { id: 's_7', title: 'Propagate uncertainties', done: false }
          ], links: [], createdAt: at(-4, 9) },
          { id: 't_12', groupId: 'g_lab', title: 'Draft methods section', description: '500 words, past tense, passive where needed.', dueAt: at(-2, 18), assigneeIds: ['u_me'], status: 'done', priority: 'low', createdBy: 'u_me', completedAt: at(-2, 20), subtasks: [], links: [], createdAt: at(-5, 9) },
          { id: 't_13', groupId: 'g_lab', title: 'Pre-lab safety quiz', description: 'Online quiz, 20 minutes.', dueAt: at(0, 23), assigneeIds: ['u_me'], status: 'todo', priority: 'low', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-1, 8) },
          /* personal to-dos — no group */
          { id: 't_14', groupId: null, title: 'Renew library books', description: 'Two are already overdue.', dueAt: at(-1, 17), assigneeIds: [], status: 'todo', priority: 'low', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-6, 9) },
          { id: 't_15', groupId: null, title: 'Print lab report', description: 'Double-sided, staple in the corner.', dueAt: at(0, 18), assigneeIds: [], status: 'todo', priority: 'med', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-2, 10) },
          { id: 't_16', groupId: null, title: 'Email tutor about the extension', description: 'Ask for two more days on the error analysis.', dueAt: at(1, 9), assigneeIds: [], status: 'todo', priority: 'high', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-1, 20) },
          { id: 't_17', groupId: null, title: 'Draft revision timetable', description: 'Block out the two weeks before exams.', dueAt: at(5, 20), assigneeIds: [], status: 'todo', priority: 'med', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-3, 21) },
          { id: 't_18', groupId: null, title: 'Book dentist appointment', description: '', dueAt: null, assigneeIds: [], status: 'todo', priority: 'low', createdBy: 'u_me', subtasks: [], links: [], createdAt: at(-11, 12) },
          { id: 't_19', groupId: null, title: 'Submit seminar reflection', description: '', dueAt: at(0, 11), assigneeIds: [], status: 'done', priority: 'low', createdBy: 'u_me', completedAt: at(0, 10), subtasks: [], links: [], createdAt: at(-4, 15) }
        ],
        folders: [
          { id: 'f_ds', name: 'Data Structures', color: 'sky' },
          { id: 'f_chem', name: 'Organic Chemistry', color: 'mint' },
          { id: 'f_mkt', name: 'Marketing', color: 'coral' },
          { id: 'f_inbox', name: 'Inbox', color: 'amber' }
        ],
        notes: [
          {
            id: 'n_1', scope: 'personal', folderId: 'f_ds', type: 'note', title: 'Big-O cheat sheet',
            body: 'Array index O(1)\nDynamic array push O(1) amortised, insert O(n)\nHash map O(1) average, O(n) worst\nBalanced BST O(log n) search/insert/delete\nHeap push/pop O(log n), peek O(1)\nGraph BFS/DFS O(V + E)\n\nSorting\nQuick O(n log n) average, O(n^2) worst (bad pivots)\nMerge O(n log n) always, O(n) extra space\nHeap O(n log n), in place\n\nExam trap: recursion depth counts toward space.',
            tags: ['complexity', 'exam'], pinned: true, createdBy: 'u_me',
            createdAt: at(-16, 21), updatedAt: at(-3, 22)
          },
          {
            id: 'n_2', scope: 'personal', folderId: 'f_chem', type: 'handwritten', title: 'Lecture 7 — titration workings',
            body: 'Scanned from the red notebook. Mole ratio step is where I keep slipping — redo example 4 before the midterm.',
            tags: ['lab', 'exam'], demo: 'hand', createdBy: 'u_me',
            createdAt: at(-8, 19), updatedAt: at(-8, 19)
          },
          {
            id: 'n_3', scope: 'personal', folderId: 'f_chem', type: 'slides', title: 'Lecture 9 — alkene reactions',
            body: 'Marks scheme: mechanism arrows, then regio + stereo rationale. Slides 14-19 are the examinable range.',
            tags: ['lecture'], demo: 'slide', createdBy: 'u_me',
            createdAt: at(-5, 14), updatedAt: at(-5, 14)
          },
          {
            id: 'n_4', scope: 'personal', folderId: 'f_chem', type: 'paper', title: 'CHEM210 past paper 2024',
            body: 'Section B question 3 is basically the same error-analysis question the midterm likes.',
            tags: ['exam', 'practice'], demo: 'paper', createdBy: 'u_me',
            createdAt: at(-20, 10), updatedAt: at(-2, 10)
          },
          {
            id: 'n_5', scope: 'personal', folderId: 'f_ds', type: 'link', title: 'Khan Academy — Recursion',
            url: 'https://www.khanacademy.org/computing/computer-science/algorithms/recursive-algorithms/a/recursion',
            body: 'Good warm-up before the problem set. Call-stack diagrams are clearer than the textbook.',
            tags: ['video'], createdBy: 'u_me',
            createdAt: at(-11, 22), updatedAt: at(-11, 22)
          },
          {
            id: 'n_6', scope: 'personal', folderId: 'f_mkt', type: 'note', title: 'Marketing framing notes',
            body: 'Market entry = where to play + why now.\nAnchor on one segment, name the wedge, then size it.\nProf hates "everyone is our customer" — kill that slide.',
            tags: ['deck'], createdBy: 'u_me',
            createdAt: at(-9, 17), updatedAt: at(-4, 18)
          },
          {
            id: 'n_7', scope: 'personal', folderId: 'f_inbox', type: 'note', title: 'Ask Dev about the sensor API auth',
            body: 'Does the ingest endpoint need a per-site token, or is the shared key enough for the demo?',
            tags: [], createdBy: 'u_me',
            createdAt: at(-1, 9), updatedAt: at(-1, 9)
          },
          { id: 'n_8', scope: 'group', groupId: 'g_cap', type: 'note', title: 'Meeting 3 minutes', body: 'Decisions\n- Pipeline spike first, UI after\n- Maya owns schema doc, Dev reviews\n- Interim demo scope: one site, live detections only\n\nNext: Wed 15:00 standup.', tags: ['minutes'], createdBy: 'u_maya', createdAt: at(-3, 16), updatedAt: at(-3, 16) },
          { id: 'n_9', scope: 'group', groupId: 'g_cap', type: 'link', title: 'Zotero group library', url: 'https://www.zotero.org/groups/', body: 'All lit review PDFs live here — add yours before Friday.', tags: [], createdBy: 'u_maya', createdAt: at(-7, 12), updatedAt: at(-7, 12) },
          { id: 'n_10', scope: 'group', groupId: 'g_deck', type: 'note', title: 'Prof feedback — narrow to 2 markets', body: 'Cut the long list. Pick two markets we can actually defend with the survey data, then show the scoring method for the shortlist.', tags: ['feedback'], createdBy: 'u_aisha', createdAt: at(-2, 13), updatedAt: at(-2, 13) },
          { id: 'n_11', scope: 'group', groupId: 'g_lab', type: 'note', title: 'Data columns after cleanup', body: 'run_id, wavelength, absorbance, replicate, flag\nBlank runs carry run_id = 0 and must be excluded from the mean.', tags: [], createdBy: 'u_liam', createdAt: at(-4, 15), updatedAt: at(-4, 15) },
          { id: 'n_12', scope: 'group', groupId: 'g_study', topicId: 'tp_cs', type: 'note', title: 'Big-O sheet — my cleaned version', body: 'Trimmed my messy notes down to the 12 complexity facts that actually come up. Heap push/pop O(log n), BFS/DFS O(V+E) — the rest is in the vault if you want the long version.', tags: ['complexity'], createdBy: 'u_me', createdAt: at(-6, 21), updatedAt: at(-6, 21) },
          { id: 'n_13', scope: 'group', groupId: 'g_study', topicId: 'tp_chem', type: 'note', title: 'Error analysis — worked sheet', body: 'Instrument error, dilution error, then propagation. I worked two examples from the past paper with the numbers written out.', tags: ['errors', 'worked'], createdBy: 'u_liam', createdAt: at(-4, 19), updatedAt: at(-4, 19) },
          { id: 'n_14', scope: 'group', groupId: 'g_study', topicId: 'tp_math', type: 'link', title: 'MATH201 — past papers index', url: 'https://example.edu/math201/past-papers', body: 'Every paper from 2019 onwards, with the marks schemes in the second folder.', tags: [], createdBy: 'u_maya', createdAt: at(-3, 11), updatedAt: at(-3, 11) },
          { id: 'n_15', scope: 'group', groupId: 'g_study', topicId: 'tp_chem', type: 'request', title: 'Anyone have the week 5 biochem slides?', body: 'Missed that lecture — happy to trade my CS notes for them.', tags: ['slides'], createdBy: 'u_maya', createdAt: at(-1, 20), updatedAt: at(-1, 20), request: { open: true, answeredBy: null, answeredAt: null, answerNoteId: null } },
          { id: 'n_16', scope: 'group', groupId: 'g_study', topicId: null, type: 'note', title: 'Exam dates, all units', body: 'CS301 — week 10 tbc\nCHEM210 — 23 Sept, Hall B\nMATH201 — week 11\n\nLibrary floor 4 is open until 23:00 in exam weeks.', tags: ['dates'], createdBy: 'u_aisha', createdAt: at(-5, 9), updatedAt: at(-2, 9) },
          { id: 'n_17', scope: 'group', groupId: 'g_study', topicId: 'tp_chem', type: 'request', title: 'Has anyone got the error-analysis worked examples?', body: '', tags: [], createdBy: 'u_me', createdAt: at(-2, 17), updatedAt: at(-2, 18), request: { open: false, answeredBy: 'u_liam', answeredAt: at(-2, 18), answerNoteId: 'n_13' } }
        ],
        events: [
          { id: 'e_1', title: 'Capstone standup', type: 'meeting', start: at(1, 15), end: at(1, 15, 30), groupId: 'g_cap', location: 'Library room 3', reminderMinutes: 60, notes: '', createdAt: at(-3, 16) },
          { id: 'e_2', title: 'DS problem set grind', type: 'session', start: at(1, 19), end: at(1, 21), groupId: null, location: '', reminderMinutes: 30, notes: 'Recursion + heaps, then the past paper.', createdAt: at(-1, 20) },
          { id: 'e_3', title: 'CHEM210 midterm', type: 'exam', start: at(3, 9), end: at(3, 11), groupId: 'g_lab', location: 'Hall B', reminderMinutes: 1440, notes: 'Bring student card + calculator.', createdAt: at(-10, 9) },
          { id: 'e_4', title: 'BUS220 final presentation', type: 'exam', start: at(9, 14), end: at(9, 14, 30), groupId: 'g_deck', location: 'Room 4.12', reminderMinutes: 1440, notes: '', createdAt: at(-4, 11) },
          { id: 'e_5', title: 'Finals crew study night', type: 'session', start: at(1, 19), end: at(1, 21), groupId: 'g_study', location: 'Library — floor 4', reminderMinutes: 1440, notes: 'Bring the error-analysis sheet. MATH past papers first hour.', createdAt: at(-1, 9) }
        ],
        notifications: { read: {}, snoozed: {}, seen: {} },
        settings: {
          theme: 'light',
          leadTimeHours: 48,
          browserNotifications: false,
          kinds: { dueSoon: true, overdue: true, assigned: true, notes: true, exams: true, sessions: true },
          google: { status: 'disconnected', lastSyncAt: null, email: null, calendar: 'Kaiden — Study' },
          elpis: { url: 'http://localhost:3333/mcp', enabled: false, token: '' },
          syncLog: []
        }
      };
    },
    /* Elpis MCP surface — documented contract, not implemented in this prototype. */
    mcpTools: [
      { name: 'neoma.list_groups', desc: 'Groups with members and open task counts' },
      { name: 'neoma.list_tasks', desc: 'Filter by group, assignee, status or due date' },
      { name: 'neoma.create_task', desc: 'Create a task with due date and assignees' },
      { name: 'neoma.update_task', desc: 'Change status, due date, assignees' },
      { name: 'neoma.upcoming', desc: 'Merged deadlines and calendar events ahead' },
      { name: 'neoma.search_vault', desc: 'Search notes, papers, slides and links' },
      { name: 'neoma.get_note', desc: 'Full text of one vault item' },
      { name: 'neoma.create_note', desc: 'Capture a note or link into a subject folder' },
      { name: 'neoma.list_events', desc: 'Calendar events in a date range' },
      { name: 'neoma.daily_brief', desc: 'Everything Elpis needs to plan the day' }
    ]
  };
})();
