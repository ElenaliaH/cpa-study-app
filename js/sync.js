/* ================================================================
   sync.js — 基于 GitHub 的数据云同步
   原理：把数据存为 data.json 文件，通过 GitHub API 读写
   用法：
     同步设置 → 输入 GitHub Token → 保存
     自动同步：打开 App 时自动拉取，数据变更后自动上传
   ================================================================ */

var Sync = (function () {
  'use strict';

  var OWNER = 'ElenaliaH';
  var REPO  = 'cpa-study-app';
  var PATH  = 'data.json';
  var SYNC_KEY = 'cpa_sync_token';

  var syncing = false;

  /* ---- Token 管理 ---- */
  function getToken() {
    return localStorage.getItem(SYNC_KEY) || '';
  }

  function setToken(t) {
    localStorage.setItem(SYNC_KEY, t);
  }

  function hasToken() {
    return getToken().length > 10;
  }

  /* ---- 上传数据到 GitHub ---- */
  function upload(callback) {
    if (!hasToken() || syncing) {
      if (callback) callback(false);
      return;
    }
    syncing = true;

    var data = {
      version: 2,
      updatedAt: new Date().toISOString(),
      subjects: Store.getSubjects(),
      manualTasks: Store.getManualTasks(),
      mistakes: Store.getMistakes(),
      examDate: Store.getExamDate()
    };

    var json    = JSON.stringify(data);
    var base64  = btoa(unescape(encodeURIComponent(json)));
    var token   = getToken();

    // 先获取当前文件的 SHA（如果存在）
    getFileInfo(function (info) {
      var body = {
        message: 'sync: ' + new Date().toLocaleString('zh-CN'),
        content: base64,
        branch: 'main'
      };
      if (info && info.sha) body.sha = info.sha;

      var xhr = new XMLHttpRequest();
      xhr.open('PUT', 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + PATH);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Accept', 'application/vnd.github+json');
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');

      xhr.onload = function () {
        syncing = false;
        if (callback) callback(xhr.status >= 200 && xhr.status < 300);
      };

      xhr.onerror = function () {
        syncing = false;
        if (callback) callback(false);
      };

      xhr.send(JSON.stringify(body));
    });
  }

  /* ---- 从 GitHub 下载数据 ---- */
  function download(callback) {
    if (!hasToken()) {
      if (callback) callback(null);
      return;
    }

    var token = getToken();
    var xhr   = new XMLHttpRequest();
    xhr.open('GET', 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + PATH);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('Accept', 'application/vnd.github+json');

    xhr.onload = function () {
      if (xhr.status === 404) {
        // data.json 还不存在，首次使用
        if (callback) callback({ firstTime: true });
        return;
      }
      if (xhr.status !== 200) {
        if (callback) callback(null);
        return;
      }
      try {
        var resp = JSON.parse(xhr.responseText);
        var json = JSON.parse(decodeURIComponent(escape(atob(resp.content))));
        if (callback) callback({ data: json, sha: resp.sha });
      } catch (e) {
        if (callback) callback(null);
      }
    };

    xhr.onerror = function () {
      if (callback) callback(null);
    };

    xhr.send();
  }

  /* ---- 获取文件信息（主要是 SHA）---- */
  function getFileInfo(callback) {
    var token = getToken();
    var xhr   = new XMLHttpRequest();
    xhr.open('GET', 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + PATH);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('Accept', 'application/vnd.github+json');

    xhr.onload = function () {
      if (xhr.status === 200) {
        var resp = JSON.parse(xhr.responseText);
        callback({ sha: resp.sha });
      } else {
        callback(null); // 文件不存在
      }
    };

    xhr.onerror = function () { callback(null); };

    xhr.send();
  }

  /* ---- 合并数据（本地优先，保留最新的）---- */
  function mergeRemoteIntoLocal(remoteData) {
    if (!remoteData || !remoteData.data) return;

    var remote = remoteData.data;
    // 合并逻辑：如果远程数据比本地新，用远程的
    var localUpdate  = localStorage.getItem('cpa_last_sync') || '';
    var remoteUpdate = remote.updatedAt || '';

    var localSubjs    = Store.getSubjects();
    var remoteSubjs   = remote.subjects || [];

    // 简单策略：比较每个科目的轮次+打卡总数，选多的
    var localChecks  = countAllCheckins(localSubjs);
    var remoteChecks = countAllCheckins(remoteSubjs);

    if (remoteChecks > localChecks) {
      // 远程数据更多，用远程的
      if (remote.examDate)     Store.setExamDate(remote.examDate);
      if (remote.subjects)     Store.saveSubjects(remote.subjects);
      if (remote.manualTasks)  Store.saveManualTasks(remote.manualTasks);
      if (remote.mistakes)     Store.saveMistakes(remote.mistakes);
      console.log('[Sync] 从云端恢复了数据（' + remoteChecks + ' 条打卡记录）');
    } else {
      console.log('[Sync] 本地数据已是最新（' + localChecks + ' 条打卡记录）');
      // 本地更新，上传到云端
      upload();
    }

    localStorage.setItem('cpa_last_sync', new Date().toISOString());
  }

  function countAllCheckins(subjects) {
    var count = 0;
    for (var i = 0; i < subjects.length; i++) {
      var rounds = subjects[i].rounds || [];
      for (var j = 0; j < rounds.length; j++) {
        count += (rounds[j].checkins || []).length;
      }
    }
    return count;
  }

  /* ---- 自动同步：下载 → 合并 → 重新渲染 ---- */
  function autoSync(callback) {
    if (!hasToken()) {
      if (callback) callback(false);
      return;
    }

    download(function (result) {
      if (result && !result.firstTime && result.data) {
        mergeRemoteIntoLocal(result);
      } else if (result && result.firstTime) {
        // 首次使用，上传当前数据
        upload();
      }
      if (callback) callback(true);
    });
  }

  /* ---- 数据变更后自动上传（防抖）---- */
  var uploadTimer = null;
  function scheduleUpload() {
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = setTimeout(function () {
      upload(function (ok) {
        if (ok) console.log('[Sync] 数据已同步到云端 ✅');
      });
    }, 2000); // 2秒防抖：连续操作只上传最后一次
  }

  /* ---- 暴露接口 ---- */
  return {
    getToken: getToken,
    setToken: setToken,
    hasToken: hasToken,
    upload: upload,
    download: download,
    autoSync: autoSync,
    scheduleUpload: scheduleUpload
  };
})();
