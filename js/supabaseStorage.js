/* ================================================================
   supabaseStorage.js — 统一存储层
   邮箱密码登录 + Supabase 云同步 + localStorage 缓存
   ================================================================ */

var SupabaseStorage = (function () {
  'use strict';

  /* ---- 同步状态 ---- */
  var STATUS = { NOT_LOGGED_IN: '未登录', SYNCING: '同步中...', SYNCED: '已同步', ERROR: '同步失败', LOCAL: '本地缓存' };

  function log(msg) { console.log('[Sync] ' + msg); }

  /* ---- 登录 ---- */
  function login(email, password, callback) {
    if (!supabaseClient) { callback('Supabase SDK 未初始化'); return; }
    log('登录: ' + email);
    supabaseClient.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) { callback(res.error.message || '登录失败'); return; }
        log('✅ 登录成功');
        cachedUser = res.data.user;
        callback(null);
      })
      .catch(function (err) { callback(err.message || '登录失败'); });
  }

  /* ---- 登出 ---- */
  function logout(callback) {
    if (!supabaseClient) { if (callback) callback(); return; }
    supabaseClient.auth.signOut().then(function () {
      log('已登出');
      if (callback) callback();
    });
  }

  /* ---- 获取当前用户（缓存 + 异步刷新）---- */
  var cachedUser = null;

  function refreshSession(callback) {
    if (!supabaseClient) { if (callback) callback(); return; }
    supabaseClient.auth.getSession().then(function (res) {
      if (res.data && res.data.session) {
        cachedUser = res.data.session.user;
      } else {
        cachedUser = null;
      }
      if (callback) callback();
    }).catch(function () {
      cachedUser = null;
      if (callback) callback();
    });
  }

  function getCurrentUser() {
    return cachedUser;
  }

  function isLoggedIn() {
    return !!cachedUser;
  }

  /* ---- 默认数据结构 ---- */
  function getDefaultAppData() {
    return {
      examDate: '2026-08-23',
      subjects: [],
      manualTasks: [],
      mistakes: [],
      schemaVersion: 2
    };
  }

  /* ---- 本地缓存 ---- */
  function loadLocalData() {
    try {
      var raw = localStorage.getItem('cpa_appdata');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function saveLocalData(data) {
    try { localStorage.setItem('cpa_appdata', JSON.stringify(data)); } catch (e) {}
  }

  /* ---- 云端读写 ---- */
  function loadCloudData(callback) {
    if (!isLoggedIn()) { callback(null); return; }
    var user = getCurrentUser();
    log('加载云端数据...');
    supabaseClient.from('user_app_data').select('data').eq('user_id', user.id).maybeSingle()
      .then(function (res) {
        if (res.error) { log('加载失败: ' + res.error.message); callback(null); return; }
        if (res.data && res.data.data) {
          log('✅ 云端数据已加载');
          callback(res.data.data);
        } else {
          log('云端无数据');
          callback(null);
        }
      })
      .catch(function (err) { log('网络错误: ' + err.message); callback(null); });
  }

  function saveCloudData(data, callback) {
    if (!isLoggedIn()) { if (callback) callback(false); return; }
    var user = getCurrentUser();
    supabaseClient.from('user_app_data').upsert({
      user_id: user.id,
      data: data,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).then(function (res) {
      if (res.error) { log('保存失败: ' + res.error.message); if (callback) callback(false); return; }
      log('✅ 云端已保存');
      if (callback) callback(true);
    }).catch(function (err) { log('保存错误: ' + err.message); if (callback) callback(false); });
  }

  /* ---- 核心：加载应用数据（登录后调用）---- */
  function loadAppData(callback) {
    var local = loadLocalData();
    loadCloudData(function (cloud) {
      if (!cloud && !local) {
        // 都没有 → 用默认
        var def = getDefaultAppData();
        saveLocalData(def);
        callback(def);
        return;
      }
      if (cloud && !local) {
        // 只有云端 → 用云端
        saveLocalData(cloud);
        callback(cloud);
        return;
      }
      if (!cloud && local) {
        // 只有本地 → 上传到云端
        saveCloudData(local);
        callback(local);
        return;
      }
      // 都有 → 云端优先
      saveLocalData(cloud);
      callback(cloud);
    });
  }

  /* ---- 核心：保存应用数据（业务变更后调用）---- */
  function saveAppData(data) {
    saveLocalData(data);
    if (isLoggedIn()) {
      saveCloudData(data);
    }
  }

  /* ---- 从 Store 构建完整数据 ---- */
  function buildDataFromStore() {
    return {
      examDate: Store.getExamDate(),
      subjects: Store.getSubjects(),
      manualTasks: Store.getManualTasks(),
      mistakes: Store.getMistakes(),
      schemaVersion: 2
    };
  }

  /* ---- 把数据写回 Store ---- */
  function applyDataToStore(data) {
    if (!data) return;
    if (data.examDate) Store.setExamDate(data.examDate);
    if (data.subjects) Store.saveSubjects(data.subjects);
    if (data.manualTasks) Store.saveManualTasks(data.manualTasks);
    if (data.mistakes) Store.saveMistakes(data.mistakes);
  }

  /* ---- 业务变更后自动同步（防抖）---- */
  var timer = null;
  function scheduleUpload() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      var data = buildDataFromStore();
      saveLocalData(data);
      saveCloudData(data);
    }, 2000);
  }

  return {
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getCurrentUser: getCurrentUser,
    refreshSession: refreshSession,
    loadAppData: loadAppData,
    saveAppData: saveAppData,
    buildDataFromStore: buildDataFromStore,
    applyDataToStore: applyDataToStore,
    scheduleUpload: scheduleUpload,
    saveLocalData: saveLocalData,
    loadLocalData: loadLocalData
  };
})();
