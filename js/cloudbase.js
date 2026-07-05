/* ================================================================
   cloudbase.js — CloudBase SDK 封装
   登录/注册/登出 + 数据上传/下载
   ================================================================ */

var Cloud = (function () {
  'use strict';

  var ENV_ID = 'cpa-study-app-d2gy7e9q32cd477a6';
  var COLLECTION = 'user_app_data';
  var DOC_ID = 'app_data';

  var app = null;
  var db = null;
  var auth = null;
  var loginInfo = null;

  function log(msg) {
    console.log('[CloudBase] ' + msg);
  }

  /* ---- SDK 初始化 ---- */
  function init() {
    if (app) return;
    if (typeof cloudbase === 'undefined') {
      log('❌ SDK 未加载！请检查网络是否能访问 imgcache.qq.com');
      return false;
    }
    try {
      app = cloudbase.init({ env: ENV_ID });
      db = app.database();
      auth = app.auth({ persistence: 'local' });
      log('✅ SDK 初始化成功, EnvId: ' + ENV_ID);
    } catch (e) {
      log('❌ 初始化失败: ' + (e.message || e));
      return false;
    }

    var saved = localStorage.getItem('cpa_cloud_login');
    if (saved) {
      try { loginInfo = JSON.parse(saved); } catch (e) { loginInfo = null; }
    }
    return true;
  }

  function isLoggedIn() {
    return loginInfo && loginInfo.uid;
  }

  function getLoginInfo() {
    return loginInfo;
  }

  /* ---- 注册 ---- */
  /* ---- SDK 状态检测（前台可见）---- */
  function diag() {
    if (typeof cloudbase === 'undefined') return '❌ CloudBase SDK 未加载，网络问题';
    try {
      var test = cloudbase.init({ env: ENV_ID });
      if (!test) return '❌ 初始化返回空';
      return '✅ SDK 正常, EnvId: ' + ENV_ID;
    } catch (e) {
      return '❌ 初始化出错: ' + (e.message || e);
    }
  }

  function register(username, password, callback) {
    if (!init()) {
      if (callback) callback('CloudBase SDK 初始化失败，请检查网络');
      return;
    }
    if (!auth) {
      if (callback) callback('认证模块未就绪');
      return;
    }

    log('正在注册: ' + username);

    auth.signUpWithUsernameAndPassword(username, password)
      .then(function (res) {
        log('✅ 注册成功, uid: ' + (res.user ? res.user.uid : 'unknown'));
        // 注册成功后自动登录
        return auth.signInWithUsernameAndPassword(username, password);
      })
      .then(function (res) {
        loginInfo = { uid: res.user.uid, username: username };
        localStorage.setItem('cpa_cloud_login', JSON.stringify(loginInfo));
        log('✅ 自动登录成功');
        if (callback) callback(null);
      })
      .catch(function (err) {
        var msg = err.message || err.code || '注册失败';
        // CloudBase 常见错误码翻译
        if (msg.indexOf('INVALID_USERNAME') !== -1) msg = '用户名格式无效（需 1-32 位字母数字下划线）';
        else if (msg.indexOf('WEAK_PASSWORD') !== -1) msg = '密码强度不够（需 6 位以上）';
        else if (msg.indexOf('USERNAME_ALREADY') !== -1) msg = '用户名已被占用，请换一个';
        else if (msg.indexOf('RATE_LIMIT') !== -1) msg = '操作太频繁，请稍后再试';
        log('❌ 注册失败: ' + msg);
        if (callback) callback(msg);
      });
  }

  /* ---- 登录 ---- */
  function login(username, password, callback) {
    if (!init()) {
      if (callback) callback('CloudBase SDK 初始化失败，请检查网络');
      return;
    }
    if (!auth) {
      if (callback) callback('认证模块未就绪');
      return;
    }

    log('正在登录: ' + username);

    auth.signInWithUsernameAndPassword(username, password)
      .then(function (res) {
        loginInfo = { uid: res.user.uid, username: username };
        localStorage.setItem('cpa_cloud_login', JSON.stringify(loginInfo));
        log('✅ 登录成功');
        if (callback) callback(null);
      })
      .catch(function (err) {
        var msg = err.message || err.code || '登录失败';
        if (msg.indexOf('USER_NOT_FOUND') !== -1) msg = '用户不存在，请先注册';
        else if (msg.indexOf('INVALID_PASSWORD') !== -1 || msg.indexOf('WRONG_PASSWORD') !== -1) msg = '密码错误';
        else if (msg.indexOf('RATE_LIMIT') !== -1) msg = '操作太频繁，请稍后再试';
        log('❌ 登录失败: ' + msg);
        if (callback) callback(msg);
      });
  }

  /* ---- 登出 ---- */
  function logout() {
    loginInfo = null;
    localStorage.removeItem('cpa_cloud_login');
    if (auth) auth.signOut().catch(function () {});
    log('已登出');
  }

  /* ---- 上传 ---- */
  function upload(callback) {
    if (!isLoggedIn() || !db) { if (callback) callback(null); return; }

    var data = {
      examDate: Store.getExamDate(),
      subjects: Store.getSubjects(),
      manualTasks: Store.getManualTasks(),
      mistakes: Store.getMistakes(),
      updatedAt: new Date().toISOString()
    };

    db.collection(COLLECTION).doc(DOC_ID).set(data)
      .then(function () { log('✅ 数据已上传'); if (callback) callback(true); })
      .catch(function () {
        db.collection(COLLECTION).add(data).then(function () {
          log('✅ 数据已上传 (add)');
          if (callback) callback(true);
        }).catch(function (e) {
          log('❌ 上传失败: ' + (e.message || e));
          if (callback) callback(false);
        });
      });
  }

  /* ---- 下载 ---- */
  function download(callback) {
    if (!isLoggedIn() || !db) { if (callback) callback(null); return; }

    db.collection(COLLECTION).doc(DOC_ID).get()
      .then(function (res) {
        var d = res.data && res.data.length > 0 ? res.data[0] : null;
        if (!d || !d.subjects) { upload(callback); return; }

        var localUpdate = localStorage.getItem('cpa_last_cloud_sync') || '';
        var remoteUpdate = d.updatedAt || '';
        if (remoteUpdate > localUpdate) {
          if (d.examDate) Store.setExamDate(d.examDate);
          if (d.subjects) Store.saveSubjects(d.subjects);
          if (d.manualTasks) Store.saveManualTasks(d.manualTasks);
          if (d.mistakes) Store.saveMistakes(d.mistakes);
          log('✅ 同步云端数据');
        }
        localStorage.setItem('cpa_last_cloud_sync', new Date().toISOString());
        if (callback) callback(true);
      })
      .catch(function () { upload(callback); });
  }

  var timer = null;
  function scheduleUpload() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { upload(); }, 2000);
  }

  return {
    diag: diag,
    init: init, isLoggedIn: isLoggedIn, getLoginInfo: getLoginInfo,
    register: register, login: login, logout: logout,
    upload: upload, download: download, scheduleUpload: scheduleUpload
  };
})();
