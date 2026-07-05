/* ================================================================
   checkin.js — 打卡概览模块（按科目分组卡片）
   ================================================================ */

var Checkin = (function () {
  'use strict';

  function render() {
    var container = document.getElementById('checkinCards');
    if (!container) return;

    var subjects = Store.getSubjects();
    var html = '';

    for (var i = 0; i < subjects.length; i++) {
      html += buildSubjectCard(subjects[i]);
    }

    if (!html) {
      html = '<div class="task-empty" style="grid-column:1/-1">还没有科目，先添加科目和轮次吧</div>';
    }

    container.innerHTML = html;
  }

  function buildSubjectCard(subj) {
    var todayCompleted = Store.getSubjectTodayCompleted(subj);
    var todayPlanned   = Store.getSubjectTodayPlanned(subj);
    var lastDate       = Store.getSubjectLastCheckinDate(subj);
    var streak         = Store.getSubjectStreak(subj);
    var checkedInToday = todayCompleted > 0;

    var rate = todayPlanned > 0
      ? Math.round((todayCompleted / todayPlanned) * 100)
      : (todayCompleted > 0 ? 100 : 0);

    var statusLabel = checkedInToday ? '今日已打卡 ✓' : '今日未打卡';
    var statusCls   = checkedInToday ? 'cin-status-done' : 'cin-status-undone';

    var lastText = lastDate
      ? formatDate(lastDate)
      : '暂无记录';

    return '<div class="cin-card">' +
      '<div class="cin-header">' +
        '<span class="cin-name">' + esc(subj.name) + '</span>' +
        '<span class="cin-status ' + statusCls + '">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="cin-body">' +
        '<div class="cin-stat">' +
          '<span class="cin-val">' + todayCompleted + '</span>' +
          '<span class="cin-lbl">今日已完成</span>' +
        '</div>' +
        '<div class="cin-stat">' +
          '<span class="cin-val">' + todayPlanned + '</span>' +
          '<span class="cin-lbl">今日计划</span>' +
        '</div>' +
        '<div class="cin-stat">' +
          '<span class="cin-val">' + rate + '%</span>' +
          '<span class="cin-lbl">完成率</span>' +
        '</div>' +
      '</div>' +
      '<div class="cin-footer">' +
        '<span>📌 连续 <b>' + streak + '</b> 天</span>' +
        '<span>🕐 最近 ' + lastText + '</span>' +
      '</div>' +
    '</div>';
  }

  /** 友好日期格式 */
  function formatDate(ds) {
    var today = Store.today();
    if (ds === today) return '今天';

    var d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    var yesterday = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    if (ds === yesterday) return '昨天';

    var parts = ds.split('-');
    return parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render: render };
})();
