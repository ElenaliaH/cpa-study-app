/* ================================================================
   checkin.js - subject check-in overview cards
   ================================================================ */

var Checkin = (function () {
  'use strict';

  function render() {
    var container = document.getElementById('checkinCards');
    var subjects = Store.getSubjects();

    renderFocusOverview(subjects);
    if (!container) return;

    var html = '';
    for (var i = 0; i < subjects.length; i++) {
      html += buildSubjectCard(subjects[i]);
    }

    if (!html) {
      html = '<div class="task-empty" style="grid-column:1/-1">\u8fd8\u6ca1\u6709\u79d1\u76ee\uff0c\u5148\u6dfb\u52a0\u79d1\u76ee\u548c\u8f6e\u6b21\u540e\u518d\u5f00\u59cb\u6253\u5361\u3002</div>';
    }

    container.innerHTML = html;
  }

  function renderFocusOverview(subjects) {
    var container = document.getElementById('focusOverview');
    if (!container) return;

    var totals = { today: 0, week: 0, total: 0 };
    var rows = '';
    var fmtFocus = getFocusFormatter();

    for (var i = 0; i < subjects.length; i++) {
      var subj = subjects[i];
      var stats = getSubjectFocusStats(subj.id);
      totals.today += stats.today;
      totals.week += stats.week;
      totals.total += stats.total;

      rows += '<button class="focus-overview-subject" type="button" data-subject-id="' + escAttr(subj.id) + '">' +
        '<span class="focus-overview-name">' + esc(subj.name) + '</span>' +
        '<span>\u4eca\u65e5 <b>' + fmtFocus(stats.today) + '</b></span>' +
        '<span>\u672c\u5468 <b>' + fmtFocus(stats.week) + '</b></span>' +
        '<span>\u7d2f\u8ba1 <b>' + fmtFocus(stats.total) + '</b></span>' +
      '</button>';
    }

    if (!rows) {
      rows = '<div class="task-empty">\u8fd8\u6ca1\u6709\u79d1\u76ee\uff0c\u6dfb\u52a0\u79d1\u76ee\u540e\u4f1a\u663e\u793a\u5b66\u4e60\u65f6\u957f\u660e\u7ec6\u3002</div>';
    }

    container.innerHTML =
      '<div class="focus-overview-totals">' +
        buildTotalItem('\u4eca\u65e5\u603b\u5b66\u4e60\u65f6\u957f', fmtFocus(totals.today)) +
        buildTotalItem('\u672c\u5468\u603b\u5b66\u4e60\u65f6\u957f', fmtFocus(totals.week)) +
        buildTotalItem('\u7d2f\u8ba1\u603b\u5b66\u4e60\u65f6\u957f', fmtFocus(totals.total)) +
      '</div>' +
      '<div class="focus-overview-list">' + rows + '</div>';

    bindFocusOverviewButtons(container);
  }

  function buildTotalItem(label, value) {
    return '<div class="focus-overview-total">' +
      '<span>' + label + '</span>' +
      '<b>' + value + '</b>' +
    '</div>';
  }

  function bindFocusOverviewButtons(container) {
    var buttons = container.querySelectorAll('.focus-overview-subject');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        if (typeof Focus !== 'undefined' && Focus.editTodayFocusMinutes) {
          Focus.editTodayFocusMinutes(this.dataset.subjectId);
        }
      });
    }
  }

  function getSubjectFocusStats(subjectId) {
    if (typeof Focus !== 'undefined' && Focus.getSubjectFocusStats) {
      return Focus.getSubjectFocusStats(subjectId);
    }
    return { today: 0, week: 0, total: 0 };
  }

  function getFocusFormatter() {
    if (typeof Focus !== 'undefined' && Focus.formatMinutes) return Focus.formatMinutes;
    return function (m) { return (m || 0) + '\u5206\u949f'; };
  }

  function buildSubjectCard(subj) {
    var todayCompleted = Store.getSubjectTodayCompleted(subj);
    var todayPlanned = Store.getSubjectTodayPlanned(subj);
    var lastDate = Store.getSubjectLastCheckinDate(subj);
    var streak = Store.getSubjectStreak(subj);
    var checkedInToday = todayCompleted > 0;

    var rate = todayPlanned > 0
      ? Math.round((todayCompleted / todayPlanned) * 100)
      : (todayCompleted > 0 ? 100 : 0);

    var statusLabel = checkedInToday ? '\u4eca\u65e5\u5df2\u6253\u5361 \u2713' : '\u4eca\u65e5\u672a\u6253\u5361';
    var statusCls = checkedInToday ? 'cin-status-done' : 'cin-status-undone';
    var lastText = lastDate ? formatDate(lastDate) : '\u6682\u65e0\u8bb0\u5f55';

    return '<div class="cin-card">' +
      '<div class="cin-header">' +
        '<span class="cin-name">' + esc(subj.name) + '</span>' +
        '<span class="cin-status ' + statusCls + '">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="cin-body">' +
        '<div class="cin-stat">' +
          '<span class="cin-val">' + todayCompleted + '</span>' +
          '<span class="cin-lbl">\u4eca\u65e5\u5df2\u5b8c\u6210</span>' +
        '</div>' +
        '<div class="cin-stat">' +
          '<span class="cin-val">' + todayPlanned + '</span>' +
          '<span class="cin-lbl">\u4eca\u65e5\u8ba1\u5212</span>' +
        '</div>' +
        '<div class="cin-stat">' +
          '<span class="cin-val">' + rate + '%</span>' +
          '<span class="cin-lbl">\u5b8c\u6210\u7387</span>' +
        '</div>' +
      '</div>' +
      '<div class="cin-footer">' +
        '<span>\u8fde\u7eed <b>' + streak + '</b> \u5929</span>' +
        '<span>\u6700\u8fd1 ' + lastText + '</span>' +
      '</div>' +
    '</div>';
  }

  function formatDate(ds) {
    var today = Store.today();
    if (ds === today) return '\u4eca\u5929';

    var d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    var yesterday = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    if (ds === yesterday) return '\u6628\u5929';

    var parts = ds.split('-');
    return parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render: render };
})();