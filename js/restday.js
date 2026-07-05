/* ================================================================
   restday.js — 休息日日历选择器
   用法：RestDayPicker.show(function(selectedDate) { ... });
   ================================================================ */

var RestDayPicker = (function () {
  'use strict';

  var overlay, grid, monthLabel, selectedEl, confirmBtn, cancelBtn;
  var viewYear, viewMonth;
  var selectedDate = null;
  var callback = null;

  var WEEK = ['一','二','三','四','五','六','日'];

  function init() {
    overlay    = document.getElementById('restDayOverlay');
    grid       = document.getElementById('restDayGrid');
    monthLabel = document.getElementById('rdMonthLabel');
    selectedEl = document.getElementById('restDaySelected');
    confirmBtn = document.getElementById('rdConfirm');
    cancelBtn  = document.getElementById('rdCancel');

    document.getElementById('rdPrevMonth').addEventListener('click', function () {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderGrid();
    });
    document.getElementById('rdNextMonth').addEventListener('click', function () {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderGrid();
    });

    confirmBtn.addEventListener('click', function () {
      if (selectedDate && callback) callback(selectedDate);
      hide();
    });

    cancelBtn.addEventListener('click', function () {
      hide();
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hide();
    });
  }

  function hide() {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    callback = null;
  }

  function show(cb) {
    var today = new Date();
    var tdStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    viewYear  = today.getFullYear();
    viewMonth = today.getMonth();
    selectedDate = tdStr;
    callback  = cb;

    renderGrid();
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function renderGrid() {
    monthLabel.textContent = viewYear + '年 ' + (viewMonth + 1) + '月';

    var html = '';
    for (var i = 0; i < 7; i++) {
      html += '<div class="rd-label">' + WEEK[i] + '</div>';
    }

    var firstDay = new Date(viewYear, viewMonth, 1);
    var lastDay  = new Date(viewYear, viewMonth + 1, 0);
    var totalDays = lastDay.getDate();

    var startDow = firstDay.getDay();
    if (startDow === 0) startDow = 7;

    // 前面空白
    for (var b = 1; b < startDow; b++) {
      html += '<div class="rd-day other-month"></div>';
    }

    var today = new Date();
    var tdStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    for (var d = 1; d <= totalDays; d++) {
      var ds = viewYear + '-' +
        String(viewMonth + 1).padStart(2, '0') + '-' +
        String(d).padStart(2, '0');

      var cls = 'rd-day';
      if (ds === tdStr) cls += ' today';
      if (ds === selectedDate) cls += ' selected';

      html += '<div class="' + cls + '" data-date="' + ds + '">' + d + '</div>';
    }

    grid.innerHTML = html;

    // 绑定点击
    var days = grid.querySelectorAll('.rd-day:not(.other-month)');
    for (var j = 0; j < days.length; j++) {
      days[j].addEventListener('click', function () {
        selectedDate = this.dataset.date;
        renderGrid();
      });
    }

    selectedEl.textContent = '已选：' + selectedDate;
  }

  document.addEventListener('DOMContentLoaded', init);

  return { show: show };
})();
