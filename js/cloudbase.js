/* ================================================================
   cloudbase.js — CloudBase SDK 封装（匿名登录）
   ================================================================ */

var Cloud = (function () {
  'use strict';

  var ENV_ID = 'cpa-study-app-d2gy7e9q32c4d77a6';
  var REGION = 'ap-shanghai';
  var COLLECTION = 'user_app_data';
  var DOC_ID = 'app_data';

  var app = null;
  var db = null;
  var auth = null;
  var loginInfo = null;

  function log(msg) { console.log('[CloudBase] ' + msg); }

  function init() {
    if (app) return true;
    if (typeof cloudbase === 'undefined') { log('❌ SDK 未加载'); return false; }
    try {
      app = cloudbase.init({ env: ENV_ID, region: REGION });
      auth = app.auth({ persistence: 'local' });
      db = app.database();
      log('✅ SDK 就绪');
      return true;
    } catch (e) { log('❌ 初始化: ' + (e.message || e)); return false; }
  }

  function diag() {
    if (typeof cloudbase === 'undefined') return '❌ SDK 未加载';
    if (!init()) return '❌ 初始化失败';
    return '✅ SDK 正常, EnvId: ' + ENV_ID;
  }

  function isLoggedIn() {
    if (loginInfo && loginInfo.uid) return true;
    var s = localStorage.getItem('cpa_cloud_login');
    if (s) { try { loginInfo = JSON.parse(s); return !!loginInfo.uid; } catch (e) {} }
    return false;
  }

  function getLoginInfo() { return loginInfo; }

  /* ---- 用户名密码登录 ---- */
  function login(username, password, callback) {
    if (!init()) { callback('SDK 未初始化'); return; }

    /* 安全取 uid */
    function getUid(source) {
      if (!source) return null;
      var user = source.user || source.userinfo || source.userInfo || source.data || source;
      return (user.user && user.user.uid) || user.uid || (user.data && user.data.user && user.data.user.uid) || user._id || user.userId || user.sub || null;
    }

    /* 安全信息，避免循环引用 */
    function safeInfo(obj) {
      try {
        return {
          type: typeof obj,
          keys: obj ? Object.keys(obj).slice(0, 20) : [],
          hasUser: !!(obj && obj.user),
          userType: obj && obj.user ? typeof obj.user : 'none',
          userKeys: (obj && obj.user && typeof obj.user === 'object') ? Object.keys(obj.user).slice(0, 10) : [],
          hasData: !!(obj && obj.data),
          dataKeys: (obj && obj.data && typeof obj.data === 'object') ? Object.keys(obj.data).slice(0, 10) : []
        };
      } catch (e) { return { error: e.message }; }
    }

    log('登录中: ' + username);

    function doSignIn(fn) {
      fn()
        .then(function (res) {
          var s = safeInfo(res);
          log('result: ' + JSON.stringify(s));
          console.log('[CloudBase] result:', res);

          function save(uid) {
            loginInfo = { uid: uid, username: username };
            localStorage.setItem('cpa_cloud_login', JSON.stringify(loginInfo));
            log('✅ 登录成功, uid: ' + uid);
            callback(null);
          }

          function tryLoginState() {
            if (typeof auth.getLoginState === 'function') {
              auth.getLoginState().then(function (ls) {
                var sl = safeInfo(ls);
                log('loginState: ' + JSON.stringify(sl));
                console.log('[CloudBase] loginState:', ls);
                var uid = getUid(ls) || getUid(res);
                if (uid) { save(uid); return; }
                alert('无法获取用户 ID\n\nresult: ' + JSON.stringify(s) + '\nloginState: ' + JSON.stringify(sl));
                callback('无法获取用户 ID');
              }).catch(function (e) {
                tryLoginStateFallback({ error: e.message || 'getLoginState failed' });
              });
            } else {
              tryLoginStateFallback({ notAvailable: true });
            }
          }

          function tryLoginStateFallback(ls) {
            var uid = getUid(ls) || getUid(res);
            if (uid) { save(uid); return; }
            var sf = safeInfo(ls);
            alert('无法获取用户 ID\n\nresult: ' + JSON.stringify(s) + '\nloginState: ' + JSON.stringify(sf));
            callback('无法获取用户 ID');
          }

          var uid = getUid(res);
          if (uid) { save(uid); return; }
          tryLoginState();
        })
        .catch(function (err) {
          var m = (err && (err.message || err.code)) || String(err).substring(0, 200);
          log('❌ 登录失败: ' + m);
          callback(m);
        });
    }

    // 优先 signInWithUsernameAndPassword
    if (typeof auth.signInWithUsernameAndPassword === 'function') {
      doSignIn(function () { return auth.signInWithUsernameAndPassword(username, password); });
    } else if (typeof auth.signInWithPassword === 'function') {
      doSignIn(function () { return auth.signInWithPassword(username, password); });
    } else {
      callback('SDK 不支持用户名密码登录');
    }
  }

  function logout() {
    loginInfo = null;
    localStorage.removeItem('cpa_cloud_login');
    if (auth) auth.signOut().catch(function () {});
  }

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
      .then(function () { log('✅ 上传'); if (callback) callback(true); })
      .catch(function () { if (callback) callback(false); });
  }

  function download(callback) {
    if (!isLoggedIn() || !db) { if (callback) callback(null); return; }
    db.collection(COLLECTION).doc(DOC_ID).get()
      .then(function (res) {
        var arr = res.data || [];
        var d = arr.length > 0 ? arr[0] : null;
        if (!d || !d.subjects) { upload(callback); return; }
        var lu = localStorage.getItem('cpa_last_cloud_sync') || '';
        if (d.updatedAt && d.updatedAt > lu) {
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
    init: init, diag: diag, isLoggedIn: isLoggedIn, getLoginInfo: getLoginInfo,
    login: login, logout: logout,
    upload: upload, download: download, scheduleUpload: scheduleUpload
  };
})();
