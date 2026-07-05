/* ================================================================
   app.js — 应用入口 + 标签页路由 + CloudBase 登录
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

  /* ---- 登录界面 ---- */
  function showLogin(msg) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
    if (msg) {
      var el = document.getElementById('loginMsg');
      if (el) { el.textContent = msg; el.style.display = 'block'; }
    }
  }

  function hideLogin() {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function doLogin() {
    var user = document.getElementById('loginUser').value.trim();
    var pass = document.getElementById('loginPass').value.trim();
    if (!user || !pass) {
      var el = document.getElementById('loginMsg');
      if (el) { el.textContent = '请输入用户名和密码'; el.style.display = 'block'; }
      return;
    }

    var btnLogin = document.getElementById('btnLogin');
    if (btnLogin) { btnLogin.textContent = '登录中...'; btnLogin.disabled = true; }
    Cloud.login(user, pass, function (err) {
      if (btnLogin) { btnLogin.textContent = '登录'; btnLogin.disabled = false; }
      if (err) {
        console.error('[登录失败]', err);
        var el = document.getElementById('loginMsg');
        if (el) { el.textContent = '❌ ' + err; el.style.display = 'block'; }
        return;
      }
      afterLogin();
    });
  }

  function doRegister() {
    var user = document.getElementById('loginUser').value.trim();
    var pass = document.getElementById('loginPass').value.trim();
    if (!user || !pass) {
      var el = document.getElementById('loginMsg');
      if (el) { el.textContent = '请输入用户名和密码'; el.style.display = 'block'; }
      return;
    }
    if (pass.length < 6) {
      var el = document.getElementById('loginMsg');
      if (el) { el.textContent = '密码至少 6 位'; el.style.display = 'block'; }
      return;
    }

    var btnReg = document.getElementById('btnReg');
    if (btnReg) { btnReg.textContent = '注册中...'; btnReg.disabled = true; }
    Cloud.register(user, pass, function (err) {
      if (btnReg) { btnReg.textContent = '注册'; btnReg.disabled = false; }
      if (err) {
        console.error('[注册失败]', err);
        var el = document.getElementById('loginMsg');
        if (el) { el.textContent = '❌ ' + err; el.style.display = 'block'; }
        return;
      }
      afterLogin();
    });
  }

  function afterLogin() {
    hideLogin();
    Cloud.download(function () {
      startApp();
    });
  }

  function bindLogin() {
    var btnLogin = document.getElementById('btnLogin');
    var btnReg = document.getElementById('btnReg');
    var inputPass = document.getElementById('loginPass');

    if (btnLogin) btnLogin.addEventListener('click', doLogin);
    if (btnReg) btnReg.addEventListener('click', doRegister);
    if (inputPass) inputPass.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doLogin();
    });
  }

  /* ---- 启动应用 ---- */
  function startApp() {
    if (started) return;
    started = true;

    bindTabs();
    Countdown.init();
    Tasks.init();
    switchTab('tasks');
    if (typeof Subjects !== 'undefined') Subjects.init();

    // 添加登出按钮到导航栏
    var info = Cloud.getLoginInfo();
    var navTop = document.querySelector('.nav-top');
    if (navTop && info) {
      var logoutBtn = document.createElement('button');
      logoutBtn.className = 'btn btn-sm btn-ghost';
      logoutBtn.textContent = '登出';
      logoutBtn.style.fontSize = '12px';
      logoutBtn.addEventListener('click', function () {
        Cloud.logout();
        location.reload();
      });
      navTop.appendChild(logoutBtn);
    }

    console.log('[CPA Study] 已登录: ' + (info ? info.username : ''));
  }

  /* ---- 初始化 ---- */
  function init() {
    Cloud.init();
    bindLogin();

    if (Cloud.isLoggedIn()) {
      // 已登录 → 直接拉云端数据
      Cloud.download(function () {
        startApp();
      });
    } else {
      // 未登录 → 显示登录界面
      showLogin();
    }
  }

  return { init: init, switchTab: switchTab };
})();

window.addEventListener('DOMContentLoaded', function () {
  App.init();
});
