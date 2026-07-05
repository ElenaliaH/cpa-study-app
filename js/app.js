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

  /* ---- 同步设置面板 ---- */
  function bindSyncUI() {
    var setupBtn  = document.getElementById('syncSetupBtn');
    var syncNowBtn = document.getElementById('syncNowBtn');
    var panel     = document.getElementById('syncPanel');
    var saveBtn   = document.getElementById('syncSaveBtn');
    var input     = document.getElementById('syncTokenInput');

    if (!setupBtn || !panel) return;

    // 已有 token 时自动填入
    if (typeof Sync !== 'undefined' && Sync.hasToken()) {
      setupBtn.textContent = '☁️ 已启用同步';
      if (syncNowBtn) syncNowBtn.style.display = 'inline-block';
      input.value = Sync.getToken();
    }

    setupBtn.addEventListener('click', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    saveBtn.addEventListener('click', function () {
      var token = input.value.trim();
      if (!token || token.length < 10) { alert('请输入有效的 GitHub Token'); return; }
      Sync.setToken(token);
      panel.style.display = 'none';
      setupBtn.textContent = '☁️ 已启用同步';
      if (syncNowBtn) syncNowBtn.style.display = 'inline-block';
      // 首次设置后立刻上传
      Sync.upload(function (ok) {
        alert(ok ? '✅ 同步成功！' : '⚠️ 同步失败，请检查 Token 是否正确');
      });
    });

    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', function () {
        syncNowBtn.textContent = '⏳ 同步中...';
        Sync.upload(function (ok) {
          syncNowBtn.textContent = '🔄 立即同步';
          alert(ok ? '✅ 同步成功！' : '⚠️ 同步失败，请检查网络');
        });
      });
    }
  }

  function init() {
    bindTabs();
    bindSyncUI();
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
