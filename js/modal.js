/* ================================================================
   modal.js — 自定义确认弹窗
   替代浏览器默认 confirm()，样式与 Apple 风格一致
   用法：Modal.confirm('确定要删除吗？', function(ok) { if (ok) { ... } });
   ================================================================ */

var Modal = (function () {
  'use strict';

  var overlay, msgEl, btnCancel, btnConfirm;
  var callback = null;

  function init() {
    overlay    = document.getElementById('modalOverlay');
    msgEl      = document.getElementById('modalMsg');
    btnCancel  = document.getElementById('modalCancel');
    btnConfirm = document.getElementById('modalConfirm');

    btnCancel.addEventListener('click', function () {
      hide();
      if (callback) callback(false);
    });

    btnConfirm.addEventListener('click', function () {
      hide();
      if (callback) callback(true);
    });

    // 点击遮罩层关闭
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        hide();
        if (callback) callback(false);
      }
    });
  }

  function hide() {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function show(message, cb) {
    msgEl.textContent = message;
    callback = cb;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    btnConfirm.focus();
  }

  // 页面加载时初始化
  document.addEventListener('DOMContentLoaded', init);

  return { confirm: show };
})();
