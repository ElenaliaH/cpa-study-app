/* ================================================================
   tasks.js — 首页：今日计划（自动）+ iPhone 风格手动任务
   ================================================================ */

var Tasks = (function () {
  'use strict';

  var showAllCompleted = false; // 是否显示超过7天的已完成任务
  var editTaskId = null;       // 当前正在编辑的任务 ID

  /* ---- 渲染科目下拉 ---- */
  function renderSubjectOptions() {
    var sel = document.getElementById('subjectSelect');
    if (!sel) return;
    var subjects = Store.getSubjects();
    sel.innerHTML = '';
    for (var i = 0; i < subjects.length; i++) {
      var o = document.createElement('option');
      o.value = subjects[i].id;
      o.textContent = subjects[i].name;
      sel.appendChild(o);
    }
  }

  function render() {
    renderDailyPlan();
    renderManualTasks();
  }

  /* ======== 今日计划（自动生成）======== */
  function renderDailyPlan() {
    var c = document.getElementById('dailyPlanList');
    if (!c) return;
    var subjects = Store.getSubjects();
    var h = '';
    for (var i = 0; i < subjects.length; i++) {
      var s = subjects[i];
      var rounds = s.rounds || [];
      if (rounds.length === 0) {
        h += '<div class="plan-item plan-empty"><span class="plan-subject">' + esc(s.name) + '</span><span class="plan-desc">暂未设置学习计划</span></div>';
        continue;
      }
      var ar = null;
      for (var r = 0; r < rounds.length; r++) {
        if ((typeof Progress !== 'undefined' ? Progress.getCompletedWork(rounds[r]) : 0) < (rounds[r].totalWork || 0)) { ar = rounds[r]; break; }
      }
      if (!ar) ar = rounds[rounds.length - 1];
      if (ar) {
        var dp = typeof Progress !== 'undefined' ? Progress.getDailyPlan(ar) : 0;
        var st = typeof Progress !== 'undefined' ? Progress.getProgressStatus(ar) : { label: '', cls: '' };
        h += '<div class="plan-item"><span class="plan-subject">' + esc(s.name) + '</span><span class="plan-round">' + esc(ar.name) + '</span><span class="plan-amount">今日需完成 <b>' + dp + '</b> ' + esc(ar.unit) + '</span><span class="status-badge ' + st.cls + '">' + st.label + '</span></div>';
      }
    }
    if (!h) h = '<div class="plan-item plan-empty">还没有科目，去「学习计划」页面添加吧</div>';
    c.innerHTML = h;
  }

  /* ======== 手动任务（iPhone 风格）======== */
  function renderManualTasks() {
    var list = document.getElementById('taskList');
    var meta = document.getElementById('taskProgressText');
    var prog = document.getElementById('progressFill');
    var toggleRow = document.getElementById('toggleCompletedRow');
    if (!list || !meta || !prog) return;

    var all   = Store.getManualTasks();
    var now   = new Date();
    var sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    // 筛选可见任务
    var visible = [];
    var hiddenCompleted = 0;
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      if (!t.isCompleted) {
        visible.push(t);
      } else if (showAllCompleted) {
        visible.push(t);
      } else {
        var ca = t.completedAt ? new Date(t.completedAt) : null;
        if (ca && ca >= sevenDaysAgo) {
          visible.push(t);
        } else {
          hiddenCompleted++;
        }
      }
    }

    // 统计
    var total = visible.length;
    var done  = 0;
    for (var j = 0; j < visible.length; j++) {
      if (visible[j].isCompleted) done++;
    }
    var pct = total === 0 ? 0 : Math.round((done / total) * 100);
    prog.style.width = pct + '%';
    meta.textContent = done + ' / ' + total + ' 项已完成';

    // 渲染列表
    list.innerHTML = '';
    if (total === 0) {
      var empty = document.createElement('li');
      empty.className = 'task-empty';
      empty.textContent = '还没有任务，在下方添加';
      list.appendChild(empty);
    }

    var nameMap = {};
    var subjects = Store.getSubjects();
    for (var s = 0; s < subjects.length; s++) {
      nameMap[subjects[s].id] = subjects[s].name;
    }

    for (var k = 0; k < visible.length; k++) {
      list.appendChild(buildTaskRow(visible[k], nameMap));
    }

    // 隐藏任务切换按钮
    if (toggleRow) {
      toggleRow.style.display = hiddenCompleted > 0 || showAllCompleted ? 'block' : 'none';
      var btn = document.getElementById('toggleDoneBtn');
      if (btn) {
        btn.textContent = showAllCompleted
          ? '隐藏超过7天的已完成项目'
          : '显示已完成项目（' + hiddenCompleted + '）';
      }
    }
  }

  function buildTaskRow(t, nameMap) {
    var li = document.createElement('li');
    li.className = 'mtask-row' + (t.isCompleted ? ' done' : '');

    // 勾选框
    var check = document.createElement('span');
    check.className = 'mtask-check' + (t.isCompleted ? ' done' : '');
    check.addEventListener('click', function () {
      Store.toggleManualTask(t.id);
      render();
    });
    li.appendChild(check);

    // 中间内容
    var body = document.createElement('div');
    body.className = 'mtask-body';

    var titleRow = document.createElement('div');
    titleRow.className = 'mtask-title-row';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'mtask-title' + (t.isCompleted ? ' struck' : '');
    titleSpan.textContent = t.title;
    titleRow.appendChild(titleSpan);

    // 时间标签
    if (t.dueAt) {
      var timeLabel = document.createElement('span');
      timeLabel.className = 'mtask-time';
      timeLabel.textContent = formatDueTime(t.dueAt);
      titleRow.appendChild(timeLabel);
    }

    body.appendChild(titleRow);

    // 副行：科目 + 完成时间
    var subRow = document.createElement('div');
    subRow.className = 'mtask-sub';

    var subTag = document.createElement('span');
    subTag.className = 'mtask-subject';
    subTag.textContent = nameMap[t.subjectId] || '无科目';
    subRow.appendChild(subTag);

    if (t.isCompleted && t.completedAt) {
      var doneSpan = document.createElement('span');
      doneSpan.className = 'mtask-done-time';
      doneSpan.textContent = '已完成 ' + formatCompletedTime(t.completedAt);
      subRow.appendChild(doneSpan);
    }

    if (t.note) {
      var noteSpan = document.createElement('span');
      noteSpan.className = 'mtask-note';
      noteSpan.textContent = t.note;
      subRow.appendChild(noteSpan);
    }

    body.appendChild(subRow);
    li.appendChild(body);

    // 操作按钮
    var ops = document.createElement('span');
    ops.className = 'mtask-ops';

    var editBtn = document.createElement('button');
    editBtn.className = 'mtask-edit';
    editBtn.textContent = '✎';
    editBtn.title = '编辑';
    editBtn.addEventListener('click', function () {
      showEditPanel(t);
    });
    ops.appendChild(editBtn);

    var delBtn = document.createElement('button');
    delBtn.className = 'mtask-del';
    delBtn.textContent = '×';
    delBtn.title = '删除';
    delBtn.addEventListener('click', function () {
      Store.deleteManualTask(t.id);
      render();
    });
    ops.appendChild(delBtn);

    li.appendChild(ops);

    // 编辑面板（默认隐藏）
    if (editTaskId === t.id) {
      li.appendChild(buildEditPanel(t));
    }

    return li;
  }

  /* ---- 新增任务 ---- */
  function addTask() {
    var input = document.getElementById('taskInput');
    var sel   = document.getElementById('subjectSelect');
    var dueInput = document.getElementById('taskDueInput');
    if (!input) return;
    var title = input.value.trim();
    if (!title) return;

    var data = {
      title: title,
      subjectId: sel ? sel.value : '',
      dueAt: (dueInput && dueInput.value) ? dueInput.value : null
    };
    Store.addManualTask(data);
    input.value = '';
    if (dueInput) dueInput.value = '';
    render();
  }

  /* ---- 编辑面板 ---- */
  function showEditPanel(t) {
    editTaskId = (editTaskId === t.id) ? null : t.id;
    render();
  }

  function buildEditPanel(t) {
    var panel = document.createElement('div');
    panel.className = 'mtask-edit-panel';

    // 标题
    panel.appendChild(field('任务名称',
      '<input type="text" class="ep-title" value="' + escAttr(t.title) + '">'));

    // 科目
    var subjects = Store.getSubjects();
    var selHtml = '<select class="ep-subject">';
    for (var i = 0; i < subjects.length; i++) {
      selHtml += '<option value="' + subjects[i].id + '"' +
        (subjects[i].id === t.subjectId ? ' selected' : '') + '>' +
        esc(subjects[i].name) + '</option>';
    }
    selHtml += '</select>';
    panel.appendChild(field('科目', selHtml));

    // 时间
    panel.appendChild(field('提醒时间（可选）',
      '<input type="datetime-local" class="ep-due" value="' + (t.dueAt || '') + '">'));

    // 备注
    panel.appendChild(field('备注（可选）',
      '<input type="text" class="ep-note" value="' + escAttr(t.note || '') + '" placeholder="添加备注">'));

    // 按钮
    var btns = document.createElement('div');
    btns.className = 'form-btns';

    var cancel = document.createElement('button');
    cancel.className = 'btn btn-sm btn-ghost';
    cancel.textContent = '取消';
    cancel.addEventListener('click', function () {
      editTaskId = null;
      render();
    });
    btns.appendChild(cancel);

    var save = document.createElement('button');
    save.className = 'btn btn-sm btn-primary';
    save.textContent = '保存';
    save.addEventListener('click', function () {
      var title = panel.querySelector('.ep-title').value.trim();
      if (!title) { alert('请输入任务名称'); return; }
      Store.updateManualTask(t.id, {
        title: title,
        subjectId: panel.querySelector('.ep-subject').value,
        dueAt: panel.querySelector('.ep-due').value || null,
        note: panel.querySelector('.ep-note').value.trim()
      });
      editTaskId = null;
      render();
    });
    btns.appendChild(save);
    panel.appendChild(btns);

    return panel;
  }

  function field(label, inner) {
    var d = document.createElement('div');
    d.className = 'form-field';
    d.innerHTML = '<label>' + label + '</label>' + inner;
    return d;
  }

  /* ---- 切换显示已完成 ---- */
  function toggleShowAll() {
    showAllCompleted = !showAllCompleted;
    render();
  }

  /* ---- 时间格式化 ---- */
  function formatDueTime(dueAt) {
    if (!dueAt) return '';
    // dueAt 可能是 "2026-07-05T20:00" 格式
    var parts = dueAt.split('T');
    var datePart = parts[0];
    var timePart = parts[1] ? parts[1].substring(0, 5) : '';
    var today = Store.today();

    if (datePart === today) return '今天 ' + timePart;

    var d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    var tomorrow = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    if (datePart === tomorrow) return '明天 ' + timePart;

    var dp = datePart.split('-');
    var thisYear = new Date().getFullYear();
    if (parseInt(dp[0], 10) === thisYear) {
      return dp[1] + '-' + dp[2] + (timePart ? ' ' + timePart : '');
    }
    return datePart + (timePart ? ' ' + timePart : '');
  }

  function formatCompletedTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var now = new Date();
    var diff = now.getTime() - d.getTime();
    if (diff < 86400000 && d.getDate() === now.getDate()) {
      return '今天 ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }
    diff = now.getTime() - d.getTime();
    if (diff < 172800000) {
      var yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (d.getDate() === yesterday.getDate()) {
        return '昨天 ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      }
    }
    return (d.getMonth()+1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  /* ---- 事件绑定 ---- */
  function bindEvents() {
    var btnAdd = document.getElementById('btnAdd');
    var input  = document.getElementById('taskInput');
    var toggleBtn = document.getElementById('toggleDoneBtn');
    if (btnAdd) btnAdd.addEventListener('click', addTask);
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addTask();
    });
    if (toggleBtn) toggleBtn.addEventListener('click', toggleShowAll);
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  }

  function init() {
    renderSubjectOptions();
    bindEvents();
    render();
  }

  return { init: init, render: render, renderSubjectOptions: renderSubjectOptions };
})();
