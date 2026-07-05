/* ================================================================
   app.js — 应用入口 + 标签页路由
   ================================================================ */

var App = (function () {
  'use strict';

  var activeTab = 'tasks';

  function switchTab(tabName) {
    activeTab = tabName;

    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].dataset.tab === tabName) tabs[i].classList.add('active');
      else tabs[i].classList.remove('active');
    }

    var pages = document.querySelectorAll('.page');
    for (var j = 0; j < pages.length; j++) {
      if (pages[j].dataset.page === tabName) pages[j].style.display = 'block';
      else pages[j].style.display = 'none';
    }

    if (tabName === 'tasks' && typeof Tasks !== 'undefined') Tasks.render();
    if (tabName === 'plan') {
      if (typeof Checkin !== 'undefined' && Checkin.render) Checkin.render();
      if (typeof Subjects !== 'undefined') Subjects.render();
    }
    if (tabName === 'mistakes' && typeof Mistakes !== 'undefined' && Mistakes.render) {
      Mistakes.render();
    }
  }

  function bindTabs() {
    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        switchTab(this.dataset.tab);
      });
    }

    var miniCards = document.querySelectorAll('.entry-mini');
    for (var j = 0; j < miniCards.length; j++) {
      miniCards[j].addEventListener('click', function (e) {
        e.preventDefault();
        if (this.dataset.nav === 'plan') switchTab('plan');
        if (this.dataset.nav === 'mistakes') switchTab('mistakes');
      });
    }
  }

  function init() {
    bindTabs();
    // 自动同步（Token 已保存时）
    if (typeof Sync !== 'undefined' && Sync.hasToken()) {
      Sync.autoSync(function () {
        if (typeof Tasks !== 'undefined') Tasks.render();
      });
    }
    Countdown.init();
    Tasks.init();

    switchTab('tasks');

    if (typeof Subjects !== 'undefined') Subjects.init();

    // 启动时自动从云端同步
    if (typeof Sync !== 'undefined' && Sync.hasToken()) {
      Sync.autoSync(function () {
        // 同步完成后刷新首页
        if (typeof Tasks !== 'undefined') Tasks.render();
      });
    }

    console.log('[CPA Study] 应用已启动 ✓');
  }

  return { init: init, switchTab: switchTab };
})();

window.addEventListener('DOMContentLoaded', function () {
  App.init();
});
