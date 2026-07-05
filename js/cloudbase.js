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

  /* ---- SDK 初始化 ---- */
  function init() {
    if (app) return;
    if (typeof cloudbase === 'undefined') {
      console.error('[CloudBase] SDK 未加载');
      return;
    }
    app = cloudbase.init({ env: ENV_ID });
    db = app.database();
    auth = app.auth({ persistence: 'local' });

    // 恢复登录状态
    var saved = localStorage.getItem('cpa_cloud_login');
    if (saved) {
      try { loginInfo = JSON.parse(saved); } catch (e) { loginInfo = null; }
    }
  }

  /* ---- 登录状态 ---- */
  function isLoggedIn() {
    return loginInfo && loginInfo.uid;
  }

  function getLoginInfo() {
    return loginInfo;
  }

  /* ---- 注册 ---- */
  function register(username, password, callback) {
    init();
    auth.signUpWithUsernameAndPassword(username, password)
      .then(function () {
        // 注册成功后自动登录
        return auth.signInWithUsernameAndPassword(username, password);
      })
      .then(function (res) {
        loginInfo = { uid: res.user.uid, username: username };
        localStorage.setItem('cpa_cloud_login', JSON.stringify(loginInfo));
        callback(null);
      })
      .catch(function (err) {
        callback(err.message || '注册失败');
      });
  }

  /* ---- 登录 ---- */
  function login(username, password, callback) {
    init();
    auth.signInWithUsernameAndPassword(username, password)
      .then(function (res) {
        loginInfo = { uid: res.user.uid, username: username };
        localStorage.setItem('cpa_cloud_login', JSON.stringify(loginInfo));
        callback(null);
      })
      .catch(function (err) {
        callback(err.message || '登录失败');
      });
  }

  /* ---- 登出 ---- */
  function logout() {
    loginInfo = null;
    localStorage.removeItem('cpa_cloud_login');
    if (auth) {
      auth.signOut().catch(function () {});
    }
  }

  /* ---- 上传数据到 CloudBase ---- */
  function upload(callback) {
    if (!isLoggedIn() || !db) {
      if (callback) callback(null);
      return;
    }

    var data = {
      examDate: Store.getExamDate(),
      subjects: Store.getSubjects(),
      manualTasks: Store.getManualTasks(),
      mistakes: Store.getMistakes(),
      updatedAt: new Date().toISOString()
    };

    db.collection(COLLECTION)
      .doc(DOC_ID)
      .set(data)
      .then(function () {
        if (callback) callback(true);
      })
      .catch(function () {
        // 首次写入用 add + doc
        db.collection(COLLECTION).add(data).then(function (res) {
          // 删掉多余文档只保留一个，下次用 set
          db.collection(COLLECTION).doc(DOC_ID).set(data).then(function () {
            if (callback) callback(true);
          }).catch(function () {
            if (callback) callback(false);
          });
        }).catch(function () {
          if (callback) callback(false);
        });
      });
  }

  /* ---- 从 CloudBase 下载数据 ---- */
  function download(callback) {
    if (!isLoggedIn() || !db) {
      if (callback) callback(null);
      return;
    }

    db.collection(COLLECTION)
      .doc(DOC_ID)
      .get()
      .then(function (res) {
        var d = res.data && res.data.length > 0 ? res.data[0] : null;
        if (!d || !d.subjects) {
          // 云端没有数据，上传本地数据
          upload(callback);
          return;
        }
        // 比较更新时间，用新的
        var localUpdate = localStorage.getItem('cpa_last_cloud_sync') || '';
        var remoteUpdate = d.updatedAt || '';
        if (remoteUpdate > localUpdate) {
          // 云端更新，覆盖本地
          if (d.examDate) Store.setExamDate(d.examDate);
          if (d.subjects) Store.saveSubjects(d.subjects);
          if (d.manualTasks) Store.saveManualTasks(d.manualTasks);
          if (d.mistakes) Store.saveMistakes(d.mistakes);
        }
        localStorage.setItem('cpa_last_cloud_sync', new Date().toISOString());
        if (callback) callback(true);
      })
      .catch(function () {
        // 云端不存在，上传本地
        upload(callback);
      });
  }

  /* ---- 自动上传（防抖 2 秒）---- */
  var timer = null;
  function scheduleUpload() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      upload();
    }, 2000);
  }

  return {
    init: init,
    isLoggedIn: isLoggedIn,
    getLoginInfo: getLoginInfo,
    register: register,
    login: login,
    logout: logout,
    upload: upload,
    download: download,
    scheduleUpload: scheduleUpload
  };
})();
