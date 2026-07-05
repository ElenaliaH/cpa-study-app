/* ================================================================
   countdown.js — 倒计时模块
   负责：计算倒计时、更新 Hero 区域和倒计时面板
   依赖：Store（读取考试日期）
   ================================================================ */

var Countdown = (function () {
  'use strict';

  var timerId = null;

  /* ---- DOM 引用（由 init 时传入）---- */
  var els = {};

  /* ---- 更新倒计时 ---- */
  function tick() {
    var now  = new Date();
    var exam = new Date(Store.getExamDate() + 'T00:00:00');
    var diff = exam.getTime() - now.getTime();

    if (diff <= 0) {
      els.heroDays.textContent  = '0';
      els.cdDays.textContent    = '0';
      els.cdHours.textContent   = '00';
      els.cdMinutes.textContent = '00';
      els.cdSeconds.textContent = '00';
      els.phaseText.textContent = '考试已结束，辛苦了。';
      return;
    }

    var totalSec = Math.floor(diff / 1000);
    var days    = Math.floor(totalSec / 86400);
    var hours   = Math.floor((totalSec % 86400) / 3600);
    var minutes = Math.floor((totalSec % 3600) / 60);
    var seconds = totalSec % 60;

    els.heroDays.textContent  = String(days);
    els.cdDays.textContent    = String(days);
    els.cdHours.textContent   = String(hours).padStart(2, '0');
    els.cdMinutes.textContent = String(minutes).padStart(2, '0');
    els.cdSeconds.textContent = String(seconds).padStart(2, '0');

    if (days > 60)       els.phaseText.textContent = '前路宽广，把每一步都走稳。';
    else if (days > 30)  els.phaseText.textContent = '进入关键期，保持节奏，不急不躁。';
    else if (days > 7)   els.phaseText.textContent = '冲刺阶段，每天都是决定性的一天。';
    else                 els.phaseText.textContent = '最后一段路，专注即是力量。';
  }

  /* ---- 初始化 ---- */
  function init() {
    els.heroDays  = document.getElementById('countDays');
    els.cdDays    = document.getElementById('cdDays');
    els.cdHours   = document.getElementById('cdHours');
    els.cdMinutes = document.getElementById('cdMinutes');
    els.cdSeconds = document.getElementById('cdSeconds');
    els.phaseText = document.getElementById('examPhaseText');
    els.dateInput = document.getElementById('examDateInput');
    els.todayDate = document.getElementById('todayDate');

    // 日期选择器
    els.dateInput.value = Store.getExamDate();
    els.dateInput.addEventListener('change', function () {
      Store.setExamDate(this.value);
      tick();
    });

    // 今日日期
    updateTodayDate();

    // 开始计时
    tick();
    timerId = setInterval(tick, 1000);
  }

  function updateTodayDate() {
    var now = new Date();
    var w   = ['日','一','二','三','四','五','六'][now.getDay()];
    els.todayDate.textContent =
      now.getFullYear() + '年' + (now.getMonth() + 1) + '月' +
      now.getDate() + '日 星期' + w;
  }

  /* ---- 销毁 ---- */
  function destroy() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  return { init: init, tick: tick, destroy: destroy };
})();
