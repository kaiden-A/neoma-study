/* Neoma — calendar interop: .ics export + Google Calendar template links. */
(function () {
  'use strict';
  var N = (window.Neoma = window.Neoma || {});
  var U = N.util;

  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp(iso) {
    var d = new Date(iso);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
  function fold(line) {
    if (line.length <= 74) return line;
    var out = '';
    for (var i = 0; i < line.length; i += 73) out += (i ? '\r\n ' : '') + line.slice(i, i + 73);
    return out;
  }

  var ics = {
    eventLines: function (ev, opts) {
      opts = opts || {};
      var start = new Date(ev.start);
      var end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 30 * U.MS.min);
      var lines = [
        'BEGIN:VEVENT',
        'UID:' + ev.id + '@neoma.local',
        'DTSTAMP:' + stamp(new Date().toISOString()),
        'DTSTART:' + stamp(start),
        'DTEND:' + stamp(end),
        fold('SUMMARY:' + esc(ev.title))
      ];
      var desc = [];
      if (ev.groupName) desc.push('Group: ' + ev.groupName);
      if (opts.note) desc.push(opts.note);
      if (desc.length) lines.push(fold('DESCRIPTION:' + esc(desc.join('\n'))));
      if (ev.location) lines.push(fold('LOCATION:' + esc(ev.location)));
      var reminder = ev.reminderMinutes == null ? 60 : ev.reminderMinutes;
      if (reminder > 0) {
        lines = lines.concat([
          'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(ev.title),
          'TRIGGER:-PT' + reminder + 'M', 'END:VALARM'
        ]);
      }
      lines.push('END:VEVENT');
      return lines;
    },

    buildCalendar: function (events, opts) {
      var lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Neoma//Study OS prototype//EN',
        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Neoma — Study'
      ];
      events.forEach(function (ev) { lines = lines.concat(ics.eventLines(ev, opts)); });
      lines.push('END:VCALENDAR');
      return lines.join('\r\n');
    },

    downloadAll: function (filename) {
      var events = N.store.allEvents();
      if (!events.length) return 0;
      var text = ics.buildCalendar(events);
      U.download(filename || 'neoma-study.ics', text, 'text/calendar;charset=utf-8');
      return events.length;
    },

    downloadEvent: function (ev) {
      var text = ics.buildCalendar([ev]);
      U.download(U.slug(ev.title) + '.ics', text, 'text/calendar;charset=utf-8');
    },

    googleUrl: function (ev) {
      var start = new Date(ev.start);
      var end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 30 * U.MS.min);
      var params = [
        'action=TEMPLATE',
        'text=' + encodeURIComponent(ev.title),
        'dates=' + stamp(start) + '/' + stamp(end)
      ];
      var details = [];
      if (ev.groupName) details.push('Group: ' + ev.groupName);
      details.push('Added from Neoma');
      params.push('details=' + encodeURIComponent(details.join('\n')));
      if (ev.location) params.push('location=' + encodeURIComponent(ev.location));
      return 'https://calendar.google.com/calendar/render?' + params.join('&');
    }
  };

  N.ics = ics;
})();
