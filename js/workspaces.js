/* Exam/year lifecycle. Each page load is pinned to one immutable scope. */
var Workspaces = (function () {
  'use strict';
  var current = null, rows = [], sync = null, syncState = '', uploadTimer = null;
  var userId = null;
  function copy(value) { return WorkspaceLogic.clone(value); }
  function getCurrent() { return current ? copy(current) : null; }
  function key(name) {
    if (!current || !userId) throw new Error('备考空间尚未加载');
    var tab = name === 'appdata' || (name.indexOf('cpa_') === 0 && name !== 'cpa_focus_active_timer')
      ? (sessionStorage.getItem('study:writer') || 'initial') + ':' : '';
    return 'study:v1:' + userId + ':' + current.id + ':store:' + tab + name;
  }
  function selectedKey() { return 'study:v1:' + userId + ':selected'; }
  function metaKey() { return 'study:v1:' + userId + ':workspaces'; }
  function unwrap(result) {
    if (result.error) throw new Error('备考空间服务未就绪，请稍后重试；本机数据不会覆盖云端。');
    return result.data;
  }
  function service() {
    if (typeof WorkspaceDemo !== 'undefined') return WorkspaceDemo;
    return {
      list: function () { return supabaseClient.rpc('initialize_study_workspaces').then(unwrap); },
      read: function (scope) { return supabaseClient.from('study_workspaces').select('*').eq('id', scope.id).eq('user_id', scope.user_id).single().then(unwrap); },
      save: function (scope, pending) {
        return supabaseClient.rpc('save_study_workspace', {
          p_workspace_id: scope.id, p_revision: pending.revision, p_data: pending.data, p_write_id: pending.writeId
        }).then(unwrap);
      },
      create: function (exam, year, data) {
        return supabaseClient.rpc('create_study_workspace', { p_exam_type: exam, p_year: year, p_data: data }).then(unwrap);
      },
      archive: function (scope, revision, status) {
        return supabaseClient.rpc('set_study_workspace_status', { p_workspace_id: scope.id, p_revision: revision, p_status: status }).then(unwrap);
      }
    };
  }
  function notify(state, scope) {
    if (!current || current.id !== scope.id) return;
    syncState = state;
    renderStatus();
  }
  async function initialize() {
    var user = SupabaseStorage.getCurrentUser();
    if (!user) throw new Error('请先登录');
    userId = user.id;
    var api = service();
    try {
      rows = await api.list();
      if (!Array.isArray(rows) || !rows.length || rows.some(function (row) { return row.user_id !== userId; })) throw new Error('空间列表无效');
      localStorage.setItem(metaKey(), JSON.stringify(rows));
    } catch (error) {
      var cached = localStorage.getItem(metaKey());
      if (!cached) throw error;
      rows = JSON.parse(cached);
      syncState = 'offline';
    }
    var selected = localStorage.getItem(selectedKey());
    current = rows.find(function (row) { return row.id === selected; }) || rows.find(function (row) { return row.exam_type === 'cpa' && row.year === 2026; }) || rows[0];
    // Duplicated tabs inherit sessionStorage, so each document needs its own
    // writer. WorkspaceSync recovers pending drafts across reloads by scope.
    var writer = crypto.randomUUID();
    sessionStorage.setItem('study:writer', writer);
    sync = new WorkspaceSync({ storage: localStorage, writer: writer, remote: api, notify: notify });
    var loaded = await sync.load(current);
    current = loaded.row;
    current.data = loaded.data;
    localStorage.setItem(selectedKey(), current.id);
    if (loaded.conflict) syncState = 'conflict';
    var loadedScope = getCurrent();
    setTimeout(function () { sync.flush(loadedScope); }, 0);
    return copy(loaded.data);
  }
  function assertWritable() {
    if (!current) throw new Error('请等待空间加载完成');
    if (current.status !== 'active') throw new Error('此年度已归档，请先恢复为备考中');
    if (syncState === 'conflict') throw new Error('请先处理同步冲突');
  }
  function stage(data) {
    assertWritable();
    sync.stage(current, data);
    current.data = copy(data);
    clearTimeout(uploadTimer);
    var origin = getCurrent();
    uploadTimer = setTimeout(function () { sync.flush(origin); }, 1200);
  }
  function flush() {
    clearTimeout(uploadTimer);
    return current && sync ? sync.flush(getCurrent()) : Promise.resolve(true);
  }
  async function select(id) {
    if (id === current.id) return;
    if (!rows.some(function (row) { return row.id === id; })) throw new Error('备考空间不存在');
    if (typeof Focus !== 'undefined' && Focus.prepareWorkspaceSwitch && !Focus.prepareWorkspaceSwitch()) {
      render();
      return;
    }
    await flush();
    localStorage.setItem(selectedKey(), id);
    location.reload();
  }
  function errorMessage(error) { alert(error.message || '操作失败，本机数据已保留'); }
  function option(select, value, text, selected) {
    var el = document.createElement('option');
    el.value = value; el.textContent = text; el.selected = selected;
    select.appendChild(el);
  }
  function renderStatus() {
    var el = document.getElementById('workspaceSyncStatus');
    if (!el) return;
    var messages = { saved: '已同步', pending: '待同步', offline: '离线，本机已保留', conflict: '同步冲突，请选择保留版本' };
    el.textContent = messages[syncState] || '';
    document.getElementById('workspaceConflictActions').hidden = syncState !== 'conflict';
    document.body.classList.toggle('workspace-readonly', !!current && current.status !== 'active');
  }
  function render() {
    document.getElementById('workspaceLabel').textContent = WorkspaceLogic.exams[current.exam_type].name + '备考 · ' + current.year;
    document.getElementById('workspaceArchive').textContent = current.status === 'archived' ? '恢复备考' : '归档年度';
    document.getElementById('workspaceReadonly').hidden = current.status !== 'archived';
    document.querySelector('.hero-eyebrow').textContent = '距离 ' + WorkspaceLogic.exams[current.exam_type].name + ' 考试';
    document.title = WorkspaceLogic.label(current) + ' · CPA Study';
    var demoNotice = document.getElementById('workspacePreviewNotice');
    if (demoNotice) demoNotice.hidden = typeof WorkspaceDemo === 'undefined';
    renderStatus();
  }
  function showSwitcher() {
    var dialog = document.getElementById('workspaceSwitchDialog');
    var choices = document.getElementById('workspaceSwitchChoices');
    choices.replaceChildren();
    document.getElementById('workspaceSwitchError').textContent = '';
    Object.keys(WorkspaceLogic.exams).forEach(function (exam) {
      var section = document.createElement('section');
      var heading = document.createElement('h3');
      heading.textContent = WorkspaceLogic.exams[exam].name + '备考';
      section.appendChild(heading);
      var matches = rows.filter(function (row) { return row.exam_type === exam; }).sort(function (a, b) { return b.year - a.year; });
      matches.forEach(function (row) {
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'workspace-choice'; button.dataset.workspaceId = row.id;
        button.setAttribute('aria-pressed', String(row.id === current.id));
        var label = document.createElement('span');
        label.textContent = row.year + ' 年' + (row.status === 'archived' ? ' · 已归档' : '');
        var mark = document.createElement('span'); mark.textContent = row.id === current.id ? '当前空间' : '切换';
        button.append(label, mark);
        button.addEventListener('click', async function () {
          if (row.id === current.id) { dialog.close(); return; }
          choices.querySelectorAll('button').forEach(function (el) { el.disabled = true; });
          try { await select(row.id); dialog.close(); }
          catch (error) { document.getElementById('workspaceSwitchError').textContent = error.message; }
          finally { choices.querySelectorAll('button').forEach(function (el) { el.disabled = false; }); }
        });
        section.appendChild(button);
      });
      if (!matches.length) {
        var createButton = document.createElement('button');
        createButton.type = 'button'; createButton.className = 'workspace-choice';
        createButton.textContent = '新建' + WorkspaceLogic.exams[exam].name + '备考';
        createButton.onclick = function () { dialog.close(); showCreate(exam); };
        section.appendChild(createButton);
      }
      choices.appendChild(section);
    });
    dialog.showModal();
  }
  function showCreate(exam) {
    var dialog = document.getElementById('workspaceCreateDialog');
    var selectEl = document.getElementById('workspaceCreateExam');
    selectEl.replaceChildren();
    Object.keys(WorkspaceLogic.exams).forEach(function (type) { option(selectEl, type, WorkspaceLogic.exams[type].name, type === (exam || current.exam_type)); });
    document.getElementById('workspaceCreateYear').value = exam && exam !== current.exam_type ? current.year : Math.max(new Date().getFullYear(), current.year + 1);
    document.getElementById('workspaceCopyTemplate').checked = false;
    document.getElementById('workspaceCreateDate').value = '';
    document.getElementById('workspaceCreateError').textContent = '';
    dialog.showModal();
  }
  async function create(event) {
    event.preventDefault();
    var button = document.getElementById('workspaceCreateSave');
    button.disabled = true;
    try {
      var exam = document.getElementById('workspaceCreateExam').value;
      var year = Number(document.getElementById('workspaceCreateYear').value);
      WorkspaceLogic.validate(exam, year);
      if (rows.some(function (row) { return row.exam_type === exam && row.year === year; })) throw new Error('这个考试年度已经存在');
      var useTemplate = document.getElementById('workspaceCopyTemplate').checked;
      if (useTemplate && exam !== current.exam_type) throw new Error('计划模板只能复制到同一种考试');
      var data = WorkspaceLogic.freshData(exam, year, useTemplate ? SupabaseStorage.buildDataFromStore() : null);
      var date = document.getElementById('workspaceCreateDate').value;
      if (date && Number(date.slice(0, 4)) !== year) throw new Error('考试日期必须属于所选年度');
      data.examDate = date;
      var row = await service().create(exam, year, data);
      rows.push(row);
      localStorage.setItem(metaKey(), JSON.stringify(rows));
      document.getElementById('workspaceCreateDialog').close();
      await select(row.id);
    } catch (error) { document.getElementById('workspaceCreateError').textContent = error.message; }
    finally { button.disabled = false; }
  }
  async function archive() {
    if (typeof Focus !== 'undefined' && Focus.hasActiveTimer && Focus.hasActiveTimer()) throw new Error('请先结束并保存本次学习，再归档年度');
    var status = current.status === 'active' ? 'archived' : 'active';
    if (!confirm(status === 'archived' ? '归档后仅可查看和导出，不删除任何记录。确认归档？' : '恢复该年度的备考和编辑？')) return;
    if (!await flush()) throw new Error('请先完成同步再归档');
    var row = await service().read(current);
    await service().archive(current, row.revision, status);
    location.reload();
  }
  function exportRecovery() {
    var prefix = sync.prefix(current), saved = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf(prefix) === 0 && /:pending:|:recovery:|:cloud$/.test(k)) saved[k] = JSON.parse(localStorage.getItem(k));
    }
    var url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = WorkspaceLogic.label(current) + '-sync-recovery.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  async function resolve(useLocal) {
    if (!confirm(useLocal ? '使用本页本机版本覆盖当前云端版本？双方副本会保留在本机恢复备份中。' : '使用云端版本？本机未同步修改会保留在恢复备份中。')) return;
    await sync.resolve(current, useLocal);
    location.reload();
  }
  function initUI() {
    render();
    document.getElementById('workspaceSwitchButton').addEventListener('click', showSwitcher);
    document.getElementById('workspaceSwitchClose').addEventListener('click', function () { document.getElementById('workspaceSwitchDialog').close(); });
    document.getElementById('workspaceNew').addEventListener('click', function () { showCreate(); });
    document.getElementById('workspaceCreateForm').addEventListener('submit', create);
    document.getElementById('workspaceCreateCancel').addEventListener('click', function () { document.getElementById('workspaceCreateDialog').close(); });
    document.getElementById('workspaceArchive').addEventListener('click', function () { archive().catch(errorMessage); });
    document.getElementById('workspaceRetry').addEventListener('click', function () { flush().then(function (saved) { if (saved) location.reload(); }).catch(errorMessage); });
    document.getElementById('workspaceUseCloud').addEventListener('click', function () { resolve(false).catch(errorMessage); });
    document.getElementById('workspaceUseLocal').addEventListener('click', function () { resolve(true).catch(errorMessage); });
    document.getElementById('workspaceRecovery').addEventListener('click', exportRecovery);
    window.addEventListener('online', function () { flush(); });
    window.addEventListener('pagehide', function () { flush(); });
    // Archived pages stay navigable, but mutation controls cannot invoke old handlers.
    document.addEventListener('click', function (event) {
      if (current.status === 'active' && syncState !== 'conflict') return;
      var target = event.target.closest('button,input,select,textarea');
      if (!target || target.closest('.workspace-toolbar, .workspace-dialog, .nav, .backup-row')) return;
      var allowed = /^(btnGenerateSummary|btnCopySummary|toggleDoneBtn|taxRefreshBtn|taxResumeBtn|taxCollectionBackBtn|taxExitPracticeBtn|taxOpenAnswerCardBtn|taxCloseAnswerCardBtn|taxCopyBtn|taxPrevBtn|taxNextBtn)$/;
      if (allowed.test(target.id) || target.closest('[data-tax-collection], [data-tax-chapter], #taxModeControl, #taxScopeControl, #taxAnswerCardGrid') || target.classList.contains('focus-record-toggle') || target.classList.contains('checkin-toggle')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      errorMessage(new Error(current.status === 'archived' ? '此年度已归档，可恢复备考后编辑' : '请先处理同步冲突'));
    }, true);
  }
  return { initialize: initialize, initUI: initUI, getCurrent: getCurrent, key: key, stage: stage, flush: flush,
    assertWritable: assertWritable, isReadOnly: function () { return !current || current.status !== 'active' || syncState === 'conflict'; },
    list: function () { return copy(rows); }, exportRecovery: exportRecovery };
})();
