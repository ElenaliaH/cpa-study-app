/* ================================================================
   supabaseStorage.js - auth + cloud sync + local appdata cache
   ================================================================ */

var SupabaseStorage = (function () {
  'use strict';

  var cachedUser = null;
  var applyingRemoteData = false;

  function nowIso() {
    return new Date().toISOString();
  }

  function getDefaultAppData() {
    return {
      examDate: '2026-08-23',
      subjects: [],
      manualTasks: [],
      mistakes: [],
      focus_sessions: [],
      clientUpdatedAt: nowIso(),
      schemaVersion: 2
    };
  }

  function normalizeData(data, touch) {
    data = data || getDefaultAppData();
    if (typeof data.examDate !== 'string') data.examDate = '';
    if (!Array.isArray(data.subjects)) data.subjects = [];
    if (!Array.isArray(data.manualTasks)) data.manualTasks = [];
    if (!Array.isArray(data.mistakes)) data.mistakes = [];
    if (!Array.isArray(data.focus_sessions)) data.focus_sessions = [];
    data.schemaVersion = data.schemaVersion || 2;
    if (touch) data.clientUpdatedAt = nowIso();
    return data;
  }

  function shouldSkipUpload() {
    return applyingRemoteData;
  }

  function login(email, password, callback) {
    if (!supabaseClient) { callback('Supabase SDK not initialized'); return; }
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
    Workspaces.flush().then(function () { return supabaseClient.auth.signOut(); }).then(function () {
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
      var raw = localStorage.getItem(Workspaces.key('appdata'));
      if (!raw) return null;
      return normalizeData(JSON.parse(raw), false);
    } catch (e) { return null; }
  }

  function saveLocalData(data) {
    localStorage.setItem(Workspaces.key('appdata'), JSON.stringify(normalizeData(data, false)));
  }

  function loadAppData(callback) {
    Workspaces.initialize().then(function (data) { callback(data, null); }).catch(function (error) { callback(null, error); });
  }

  function saveAppData(data) {
    data = normalizeData(data, true);
    Workspaces.stage(data);
    saveLocalData(data);
  }

  function buildDataFromStore() {
    return {
      examDate: Store.getExamDate(),
      subjects: Store.getSubjects(),
      manualTasks: Store.getManualTasks(),
      mistakes: Store.getMistakes(),
      focus_sessions: Store.getFocusSessions ? Store.getFocusSessions() : [],
      clientUpdatedAt: nowIso(),
      schemaVersion: 2
    };
  }

  function applyDataToStore(data) {
    if (!data) return;
    data = normalizeData(data, false);
    applyingRemoteData = true;
    try {
      Store.setExamDate(data.examDate);
      if (data.subjects) Store.saveSubjects(data.subjects);
      if (data.manualTasks) Store.saveManualTasks(data.manualTasks);
      if (data.mistakes) Store.saveMistakes(data.mistakes);
      if (data.focus_sessions && Store.saveFocusSessions) Store.saveFocusSessions(data.focus_sessions);
      saveLocalData(data);
    } finally {
      applyingRemoteData = false;
    }
  }

  function scheduleUpload() {
    if (shouldSkipUpload()) return;
    var data = buildDataFromStore();
    Workspaces.stage(data);
    saveLocalData(data);
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
