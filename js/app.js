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

  /* ---- 同步 ---- */
  function bindSync() {
    var saveBtn = document.getElementById('syncSaveBtn');
    var input   = document.getElementById('syncTokenInput');
    if (!saveBtn || !input) return;

    // 已有 token 自动填入
    if (typeof Sync !== 'undefined' && Sync.hasToken()) {
      input.value = Sync.getToken();
      input.placeholder = '已设置 Token ✓';
    }

    saveBtn.addEventListener('click', function () {
      var t = input.value.trim();
      if (!t || t.length < 10) { alert('请输入有效的 GitHub Token'); return; }
      Sync.setToken(t);
      Sync.upload(function (ok) {
        alert(ok ? '✅ 同步成功！换手机打开网址输入同一个 Token 就能同步。' : '⚠️ 同步失败，检查网络或 Token');
      });
    });
  }

  function init() {
    bindTabs();
    bindSync();
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
