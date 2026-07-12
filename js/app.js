/* ================================================================
   app.js — 应用入口 + 标签页路由 + Supabase 登录
   ================================================================ */

var App = (function () {
  'use strict';

  var activeTab = 'tasks';
  var started = false;

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

  function startApp() {
    if (started) return;
    started = true;

    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';

    bindTabs();
    Countdown.init();
    Tasks.init();
    switchTab('tasks');
    if (typeof Subjects !== 'undefined') Subjects.init();
    if (typeof Focus !== 'undefined') Focus.init();

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
        SupabaseStorage.loadAppData(function (data) {
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
    SupabaseStorage.loadAppData(function (data) {
      SupabaseStorage.applyDataToStore(data);
      startApp();
    });
  };

  return { init: init, switchTab: switchTab };
})();

window.addEventListener('DOMContentLoaded', function () {
  App.init();
});
