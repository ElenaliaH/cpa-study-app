/* ================================================================
   app.js — 应用入口 + 标签页路由 + Supabase 登录
   ================================================================ */

var App = (function () {
  'use strict';

  var activeTab = 'tasks';
  var started = false;

  function switchTab(tabName) {
    if (['tasks', 'plan', 'tax'].indexOf(tabName) < 0) tabName = 'tasks';
    activeTab = tabName;
    sessionStorage.setItem('study:active-view', tabName);

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
    if (tabName === 'tax' && typeof TaxPractice !== 'undefined') TaxPractice.activate();
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
        if (this.dataset.nav) switchTab(this.dataset.nav);
      });
    }
  }

  function startApp() {
    if (started) return;
    started = true;

    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';

    bindTabs();
    Workspaces.initUI();
    Countdown.init();
    Tasks.init();
    if (typeof Subjects !== 'undefined') Subjects.init();
    if (typeof Focus !== 'undefined') Focus.init();
    if (typeof TaxPractice !== 'undefined') TaxPractice.init();
    switchTab(sessionStorage.getItem('study:active-view') || 'tasks');

    var navTop = document.querySelector('.nav-top');
    if (navTop) {
      var logoutBtn = document.createElement('button');
      logoutBtn.className = 'btn btn-sm btn-ghost';
      logoutBtn.textContent = '登出';
      logoutBtn.style.fontSize = '12px';
      logoutBtn.addEventListener('click', function () {
        SupabaseStorage.logout(function () { location.reload(); });
      });
      navTop.appendChild(logoutBtn);
    }

    console.log('[CPA Study] 已启动 ✓');
  }

  function init() {
    SupabaseStorage.refreshSession(function () {
      if (SupabaseStorage.isLoggedIn()) {
        SupabaseStorage.loadAppData(function (data, error) {
          if (error) { showLoadError(error); return; }
          SupabaseStorage.applyDataToStore(data);
          startApp();
        });
      } else {
        var overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'flex';
      }
    });
  }

  window.afterLogin = function () {
    SupabaseStorage.loadAppData(function (data, error) {
      if (error) { showLoadError(error); return; }
      SupabaseStorage.applyDataToStore(data);
      startApp();
    });
  };

  function showLoadError(error) {
    document.getElementById('loginOverlay').style.display = 'flex';
    var message = document.getElementById('loginMsg');
    message.textContent = error.message || '备考空间加载失败，请稍后重试';
    message.style.display = 'block';
    if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && !document.getElementById('workspaceLocalPreview')) {
      var preview = document.createElement('a');
      preview.id = 'workspaceLocalPreview';
      preview.className = 'btn btn-sm btn-primary';
      preview.href = '/?taxDemo=1&workspacePreview=1';
      preview.textContent = '打开本地演示预览';
      message.after(preview);
    }
    if (!document.getElementById('workspaceReload')) {
      var button = document.createElement('button');
      button.id = 'workspaceReload'; button.className = 'btn btn-sm btn-primary'; button.textContent = '重新加载';
      button.onclick = function () { location.reload(); };
      message.after(button);
    }
  }

  return { init: init, switchTab: switchTab };
})();

window.addEventListener('DOMContentLoaded', function () {
  App.init();
});
