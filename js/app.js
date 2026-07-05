/* ================================================================
   app.js — 应用入口 + 标签页路由
   负责：初始化所有模块、标签切换、页面路由
   ================================================================ */

var App = (function () {
  'use strict';

  var activeTab = 'tasks'; // 默认显示首页

  /* ---- 标签切换 ---- */
  function switchTab(tabName) {
    activeTab = tabName;

    // 更新标签按钮样式
    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      if (t.dataset.tab === tabName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    }

    // 显示/隐藏对应的页面区域
    var pages = document.querySelectorAll('.page');
    for (var j = 0; j < pages.length; j++) {
      var p = pages[j];
      if (p.dataset.page === tabName) {
        p.style.display = 'block';
      } else {
        p.style.display = 'none';
      }
    }

    // 切换到特定页面时刷新数据
    if (tabName === 'tasks' && typeof Tasks !== 'undefined') {
      Tasks.render();
    }
    // 学习计划页面 = 打卡 + 科目管理
    if (tabName === 'plan') {
      if (typeof Checkin !== 'undefined' && Checkin.render) Checkin.render();
      if (typeof Subjects !== 'undefined') Subjects.render();
    }
    if (tabName === 'mistakes' && typeof Mistakes !== 'undefined' && Mistakes.render) {
      Mistakes.render();
    }
  }

  /* ---- 绑定标签事件 ---- */
  function bindTabs() {
    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        switchTab(this.dataset.tab);
      });
    }

    // 底部入口卡片也触发标签切换
    var miniCards = document.querySelectorAll('.entry-mini');
    for (var j = 0; j < miniCards.length; j++) {
      miniCards[j].addEventListener('click', function (e) {
        e.preventDefault();
        var target = this.dataset.nav;
        if (target === 'plan') switchTab('plan');
        if (target === 'mistakes') switchTab('mistakes');
      });
    }
  }

  /* ---- 初始化 ---- */
  function init() {
    bindTabs();
    Countdown.init();
    Tasks.init();

    // 延迟初始化非默认页面的模块（首屏不需要立即渲染）
    // Subjects 模块在切换到对应 tab 时才首次渲染
    // Checkin / Plan / Mistakes 同理

    // 默认显示今日任务页
    switchTab('tasks');

    // subjects 需要预初始化（绑定事件，但不渲染 UI）
    if (typeof Subjects !== 'undefined') {
      Subjects.init();
    }

    console.log('[CPA Study] 应用已启动 ✓');
  }

  return { init: init, switchTab: switchTab };
})();

// 页面加载完成后启动
window.addEventListener('DOMContentLoaded', function () {
  App.init();
});
