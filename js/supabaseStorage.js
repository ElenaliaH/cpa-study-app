/* ================================================================
   supabaseStorage.js - auth + cloud sync + local appdata cache
   ================================================================ */

var SupabaseStorage = (function () {
  'use strict';

  var cachedUser = null;
  var timer = null;
  var applyingRemoteData = false;

  function log(msg) { console.log('[Sync] ' + msg); }

  function nowIso() {
    return new Date().toISOString();
  }

  function getDefaultAppData() {
    return {
      examDate: '2026-08-23',
      subjects: [],
      manualTasks: [],
      mistakes: [],
      clientUpdatedAt: nowIso(),
      schemaVersion: 2
    };
  }

  function normalizeData(data, touch) {
    data = data || getDefaultAppData();
    if (!data.examDate) data.examDate = '2026-08-23';
    if (!Array.isArray(data.subjects)) data.subjects = [];
    if (!Array.isArray(data.manualTasks)) data.manualTasks = [];
    if (!Array.isArray(data.mistakes)) data.mistakes = [];
    data.schemaVersion = data.schemaVersion || 2;
    if (touch) data.clientUpdatedAt = nowIso();
    return data;
  }

  function getDataTime(data) {
    if (!data) return 0;
    var raw = data.clientUpdatedAt || data.updatedAt || data._cloudUpdatedAt || '';
    var time = Date.parse(raw);
    return isNaN(time) ? 0 : time;
  }

  function shouldSkipUpload() {
    return applyingRemoteData;
  }

  function login(email, password, callback) {
    if (!supabaseClient) { callback('Supabase SDK not initialized'); return; }
    log('login: ' + email);
    supabaseClient.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) { callback(res.error.message || 'login failed'); return; }
        cachedUser = res.data.user;
        callback(null);
      })
      .catch(function (err) { callback(err.message || 'login failed'); });
  }

  function logout(callback) {
    if (!supabaseClient) { if (callback) callback(); return; }
    supabaseClient.auth.signOut().then(function () {
      cachedUser = null;
      if (callback) callback();
    });
  }

  function refreshSession(callback) {
    if (!supabaseClient) { if (callback) callback(); return; }
    supabaseClient.auth.getSession().then(function (res) {
      cachedUser = res.data && res.data.session ? res.data.session.user : null;
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

  function loadLocalData() {
    try {
      var raw = localStorage.getItem('cpa_appdata');
      if (!raw) return null;
      return normalizeData(JSON.parse(raw), false);
    } catch (e) { return null; }
  }

  function saveLocalData(data) {
    try { localStorage.setItem('cpa_appdata', JSON.stringify(normalizeData(data, false))); } catch (e) {}
  }

  function loadCloudData(callback) {
    if (!isLoggedIn()) { callback(null); return; }
    var user = getCurrentUser();
    log('loading cloud data...');
    supabaseClient.from('user_app_data').select('data,updated_at').eq('user_id', user.id).maybeSingle()
      .then(function (res) {
        if (res.error) { log('load failed: ' + res.error.message); callback(null); return; }
        if (res.data && res.data.data) {
          var cloudData = normalizeData(res.data.data, false);
          if (!cloudData.clientUpdatedAt && res.data.updated_at) cloudData.clientUpdatedAt = res.data.updated_at;
          callback(cloudData);
        } else {
          callback(null);
        }
      })
      .catch(function (err) { log('network error: ' + err.message); callback(null); });
  }

  function saveCloudData(data, callback) {
    if (!isLoggedIn()) { if (callback) callback(false); return; }
    var user = getCurrentUser();
    data = normalizeData(data, false);
    supabaseClient.from('user_app_data').upsert({
      user_id: user.id,
      data: data,
      updated_at: nowIso()
    }, { onConflict: 'user_id' }).then(function (res) {
      if (res.error) { log('save failed: ' + res.error.message); if (callback) callback(false); return; }
      log('cloud saved');
      if (callback) callback(true);
    }).catch(function (err) { log('save error: ' + err.message); if (callback) callback(false); });
  }

  function loadAppData(callback) {
    var local = loadLocalData();
    loadCloudData(function (cloud) {
      if (!cloud && !local) {
        var def = normalizeData(getDefaultAppData(), true);
        saveLocalData(def);
        callback(def);
        return;
      }
      if (cloud && !local) {
        saveLocalData(cloud);
        callback(cloud);
        return;
      }
      if (!cloud && local) {
        saveCloudData(local);
        callback(local);
        return;
      }
      if (getDataTime(local) > getDataTime(cloud)) {
        saveLocalData(local);
        saveCloudData(local);
        callback(local);
      } else {
        saveLocalData(cloud);
        callback(cloud);
      }
    });
  }

  function saveAppData(data) {
    data = normalizeData(data, true);
    saveLocalData(data);
    if (isLoggedIn()) saveCloudData(data);
  }

  function buildDataFromStore() {
    return {
      examDate: Store.getExamDate(),
      subjects: Store.getSubjects(),
      manualTasks: Store.getManualTasks(),
      mistakes: Store.getMistakes(),
      clientUpdatedAt: nowIso(),
      schemaVersion: 2
    };
  }

  function applyDataToStore(data) {
    if (!data) return;
    data = normalizeData(data, false);
    applyingRemoteData = true;
    try {
      if (data.examDate) Store.setExamDate(data.examDate);
      if (data.subjects) Store.saveSubjects(data.subjects);
      if (data.manualTasks) Store.saveManualTasks(data.manualTasks);
      if (data.mistakes) Store.saveMistakes(data.mistakes);
      saveLocalData(data);
    } finally {
      applyingRemoteData = false;
    }
  }

  function scheduleUpload() {
    if (shouldSkipUpload()) return;
    var data = buildDataFromStore();
    saveLocalData(data);
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
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
    shouldSkipUpload: shouldSkipUpload,
    saveLocalData: saveLocalData,
    loadLocalData: loadLocalData
  };
})();
