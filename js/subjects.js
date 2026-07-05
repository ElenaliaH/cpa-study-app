/* ================================================================
   subjects.js — 学习计划模块（科目 + 轮次 + 打卡）
   依赖：Store、Progress
   ================================================================ */

var Subjects = (function () {
  'use strict';

  var els = {};

  /* ---- 当前拖拽状态 ---- */
  var dragIndex = -1;

  /* ---- 主渲染：科目列表 + 轮次卡片 ---- */
  function render() {
    var subjects = Store.getSubjects();
    els.list.innerHTML = '';

    if (subjects.length === 0) {
      els.list.innerHTML = '<div class="task-empty">还没有科目，在上方添加</div>';
      return;
    }

    for (var i = 0; i < subjects.length; i++) {
      var card = buildSubjectCard(subjects[i], i);
      els.list.appendChild(card);
    }

    // 同步更新下拉框
    if (typeof Tasks !== 'undefined' && Tasks.renderSubjectOptions) {
      Tasks.renderSubjectOptions();
    }
  }

  /* ---- 构建单科卡片 ---- */
  function buildSubjectCard(subj, index) {
    var card = document.createElement('div');
    card.className = 'subj-card';
    card.setAttribute('draggable', 'true');
    card.dataset.index = index;

    // 拖拽事件
    card.addEventListener('dragstart', function (e) {
      dragIndex = index;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
      // 清除所有卡片的拖拽样式
      var allCards = els.list.querySelectorAll('.subj-card');
      for (var c = 0; c < allCards.length; c++) {
        allCards[c].classList.remove('drag-over');
      }
      dragIndex = -1;
    });
    card.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', function () {
      card.classList.remove('drag-over');
    });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      card.classList.remove('drag-over');
      var from = dragIndex;
      var to   = parseInt(card.dataset.index, 10);
      if (from !== to && from >= 0 && to >= 0) {
        Store.reorderSubjects(from, to);
        render();
        if (typeof Tasks !== 'undefined') Tasks.render();
      }
    });

    // 头部：拖拽手柄 + 科目名 + 操作按钮
    var header = document.createElement('div');
    header.className = 'subj-header';

    // 拖拽手柄
    var handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';
    handle.title = '拖拽调整顺序';
    header.appendChild(handle);

    var nameEl = document.createElement('span');
    nameEl.className = 'subj-name';
    nameEl.textContent = subj.name;
    header.appendChild(nameEl);

    var actions = document.createElement('div');
    actions.className = 'subj-header-actions';

    // + 轮次
    var addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm btn-primary';
    addBtn.textContent = '+ 轮次';
    addBtn.addEventListener('click', function () { showAddRoundForm(subj.id); });
    actions.appendChild(addBtn);

    // 编辑科目
    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-ghost';
    editBtn.textContent = '✎';
    editBtn.title = '编辑科目名称';
    editBtn.addEventListener('click', function () {
      var newName = prompt('修改科目名称：', subj.name);
      if (newName && newName.trim()) {
        Store.updateSubject(subj.id, newName.trim());
        render();
        if (typeof Tasks !== 'undefined') Tasks.render();
      }
    });
    actions.appendChild(editBtn);

    // 删除科目
    var delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-ghost btn-danger';
    delBtn.textContent = '✕';
    delBtn.title = '删除科目';
    delBtn.addEventListener('click', function () {
      Modal.confirm('确定删除「' + subj.name + '」及其全部轮次和打卡记录吗？', function (ok) {
        if (!ok) return;
        Store.deleteSubject(subj.id);
        render();
        if (typeof Tasks !== 'undefined') Tasks.render();
      });
    });
    actions.appendChild(delBtn);

    header.appendChild(actions);
    card.appendChild(header);

    // 轮次列表
    var roundsWrap = document.createElement('div');
    roundsWrap.className = 'rounds-wrap';
    var rounds = subj.rounds || [];
    if (rounds.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'rounds-empty';
      empty.textContent = '暂无学习轮次，点击「+ 轮次」添加';
      roundsWrap.appendChild(empty);
    } else {
      for (var r = 0; r < rounds.length; r++) {
        roundsWrap.appendChild(buildRoundCard(subj.id, rounds[r]));
      }
    }
    card.appendChild(roundsWrap);

    // 新增轮次表单（默认隐藏）
    var formWrap = document.createElement('div');
    formWrap.className = 'round-form-wrap';
    formWrap.id = 'roundForm_' + subj.id;
    formWrap.style.display = 'none';
    formWrap.appendChild(buildRoundForm(subj.id, null, formWrap));
    card.appendChild(formWrap);

    return card;
  }

  /* ---- 构建轮次卡片 ---- */
  function buildRoundCard(subjectId, round) {
    var completed   = Progress.getCompletedWork(round);
    var remaining   = Progress.getRemainingWork(round);
    var days        = Progress.getRemainingDays(round.deadline);
    var studyDays   = Progress.getRemainingStudyDays(round.deadline, round.restDays);
    var restCount   = (round.restDays || []).length;
    var dailyPlan   = Progress.getDailyPlan(round);
    var status      = Progress.getProgressStatus(round);
    var warning     = Progress.getProgressWarning(round);
    var minStatus   = Progress.getMinTaskStatus(round);
    var isRestToday = Progress.isRestDayToday(round);

    var percent = round.totalWork > 0
      ? Math.round((completed / round.totalWork) * 100)
      : 0;

    var card = document.createElement('div');
    card.className = 'round-card';

    // 顶部信息行
    var topRow = document.createElement('div');
    topRow.className = 'round-top';

    var info = document.createElement('div');
    info.className = 'round-info';
    var restInfo = '';
    if (restCount > 0) {
      restInfo = ' · 休息日 <b>' + restCount + '</b> 天';
    }
    var createdStr = '';
    if (round.createdAt) {
      var cd = new Date(round.createdAt);
      createdStr = '创建于 ' + (cd.getMonth() + 1) + '/' + cd.getDate();
    }
    info.innerHTML =
      '<span class="round-name">' + escHtml(round.name) + '</span>' +
      '<span class="round-meta">📅 截止 ' + (round.deadline || '未设置') +
      ' · 剩余 <b>' + days + '</b> 天（学习日 <b>' + studyDays + '</b> 天）' + restInfo +
      (createdStr ? ' · <span class="round-created">' + createdStr + '</span>' : '') +
      '</span>';
    topRow.appendChild(info);

    // 状态标签
    var badge = document.createElement('span');
    badge.className = 'status-badge ' + status.cls;
    badge.textContent = status.label;
    topRow.appendChild(badge);

    // 编辑和删除按钮（右上角）
    var topActions = document.createElement('span');
    topActions.className = 'round-top-actions';

    var editRoundBtn = document.createElement('button');
    editRoundBtn.className = 'btn btn-sm btn-ghost';
    editRoundBtn.textContent = '✎';
    editRoundBtn.title = '编辑轮次';
    editRoundBtn.addEventListener('click', function () {
      showEditRoundForm(subjectId, round);
    });
    topActions.appendChild(editRoundBtn);

    var delRoundBtn = document.createElement('button');
    delRoundBtn.className = 'btn btn-sm btn-ghost btn-danger';
    delRoundBtn.textContent = '✕';
    delRoundBtn.title = '删除轮次';
    delRoundBtn.addEventListener('click', function () {
      Modal.confirm('确定删除轮次「' + round.name + '」及其打卡记录吗？', function (ok) {
        if (!ok) return;
        Store.deleteRound(subjectId, round.id);
        render();
        if (typeof Tasks !== 'undefined') Tasks.render();
      });
    });
    topActions.appendChild(delRoundBtn);

    topRow.appendChild(topActions);

    card.appendChild(topRow);

    // 进度条
    var barTrack = document.createElement('div');
    barTrack.className = 'progress-track round-progress';
    var barFill = document.createElement('div');
    barFill.className = 'progress-fill';
    barFill.style.width = percent + '%';
    if (status.key === 'overdue') barFill.style.background = 'var(--red)';
    barTrack.appendChild(barFill);

    // 进度条 + 百分比同行
    var barRow = document.createElement('div');
    barRow.className = 'round-bar-row';
    barRow.appendChild(barTrack);

    var pctSpan = document.createElement('span');
    pctSpan.className = 'round-bar-pct';
    pctSpan.textContent = percent + '%';
    barRow.appendChild(pctSpan);

    card.appendChild(barRow);

    // 预警信息
    if (warning && warning.level !== 'normal' && warning.level !== 'rest') {
      var warnEl = document.createElement('div');
      warnEl.className = 'warn-row warn-' + warning.level;
      warnEl.textContent = '⚠ ' + warning.msg;
      card.appendChild(warnEl);
    }
    if (isRestToday) {
      var restEl = document.createElement('div');
      restEl.className = 'warn-row warn-rest';
      restEl.textContent = '🌴 今日休息';
      card.appendChild(restEl);
    }

    // 最低保底状态
    if (minStatus) {
      var minEl = document.createElement('div');
      minEl.className = 'min-row ' + minStatus.cls;
      minEl.textContent = '📌 ' + minStatus.msg;
      card.appendChild(minEl);
    }

    // 数据网格
    var grid = document.createElement('div');
    grid.className = 'round-data-grid';
    grid.innerHTML =
      '<div class="rdg-item"><span class="rdg-val">' + round.totalWork + '</span><span class="rdg-lbl">总工作量(' + escHtml(round.unit) + ')</span></div>' +
      '<div class="rdg-item"><span class="rdg-val">' + completed + '</span><span class="rdg-lbl">已完成(' + escHtml(round.unit) + ')</span></div>' +
      '<div class="rdg-item"><span class="rdg-val">' + remaining + '</span><span class="rdg-lbl">剩余(' + escHtml(round.unit) + ')</span></div>' +
      '<div class="rdg-item daily"><span class="rdg-val">' + dailyPlan + '</span><span class="rdg-lbl">今日计划(' + escHtml(round.unit) + ')</span></div>';
    card.appendChild(grid);

    // 操作行（打卡按钮）
    var ops = document.createElement('div');
    ops.className = 'round-ops';

    var checkinBtn = document.createElement('button');
    checkinBtn.className = 'btn btn-sm btn-primary';
    checkinBtn.textContent = '✅ 打卡';
    checkinBtn.addEventListener('click', function () {
      toggleCheckinForm(subjectId, round.id);
    });
    ops.appendChild(checkinBtn);

    card.appendChild(ops);

    // 休息日管理
    var restWrap = document.createElement('div');
    restWrap.className = 'rest-wrap';
    var restDays = round.restDays || [];
    if (restDays.length > 0) {
      var restTags = document.createElement('div');
      restTags.className = 'rest-tags';
      for (var rd = 0; rd < Math.min(restDays.length, 5); rd++) {
        (function (sid, rid, ds) {
          var tag = document.createElement('span');
          tag.className = 'rest-tag';

          var label = document.createElement('span');
          label.className = 'rest-tag-label';
          label.textContent = '🏖 ' + ds;
          label.title = '点击修改日期';
          label.addEventListener('click', function () {
            RestDayPicker.show(function (newDate) {
              if (!newDate || newDate === ds) return;
              var rds = round.restDays || [];
              if (rds.indexOf(newDate) !== -1) { alert('该日期已是休息日'); return; }
              Store.deleteRestDay(sid, rid, ds);
              Store.addRestDay(sid, rid, newDate);
              render();
              if (typeof Tasks !== 'undefined') Tasks.render();
              if (typeof Checkin !== 'undefined') Checkin.render();
            });
          });
          tag.appendChild(label);

          var delX = document.createElement('button');
          delX.className = 'rest-tag-del';
          delX.textContent = '×';
          delX.title = '删除此休息日';
          delX.addEventListener('click', function (e) {
            e.stopPropagation();
            Store.deleteRestDay(sid, rid, ds);
            render();
            if (typeof Tasks !== 'undefined') Tasks.render();
            if (typeof Checkin !== 'undefined') Checkin.render();
          });
          tag.appendChild(delX);

          restTags.appendChild(tag);
        })(subjectId, round.id, restDays[rd]);
      }
      if (restDays.length > 5) {
        var more = document.createElement('span');
        more.className = 'rest-more';
        more.textContent = '...还有 ' + (restDays.length - 5) + ' 个';
        restTags.appendChild(more);
      }
      restWrap.appendChild(restTags);
    }
    var restBtn = document.createElement('button');
    restBtn.className = 'btn btn-sm btn-ghost';
    restBtn.textContent = '🗓 安排休息日';
    restBtn.addEventListener('click', function () {
      RestDayPicker.show(function (dateStr) {
        if (!dateStr) return;
        var restDays = round.restDays || [];
        if (restDays.indexOf(dateStr) !== -1) {
          alert('该日期已是休息日');
          return;
        }
        Store.addRestDay(subjectId, round.id, dateStr);
        render();
        if (typeof Tasks !== 'undefined') Tasks.render();
        if (typeof Checkin !== 'undefined') Checkin.render();
      });
    });
    restWrap.appendChild(restBtn);
    card.appendChild(restWrap);

    // 打卡表单（默认隐藏）
    var formWrap = document.createElement('div');
    formWrap.className = 'checkin-form-wrap';
    formWrap.id = 'checkinForm_' + round.id;
    formWrap.style.display = 'none';
    formWrap.appendChild(buildCheckinForm(subjectId, round, formWrap));
    card.appendChild(formWrap);

    // 最近打卡记录（最多显示7条，超出折叠）
    var history = document.createElement('div');
    history.className = 'checkin-history';
    var checkins = round.checkins || [];
    if (checkins.length > 0) {
      var historyTitle = document.createElement('div');
      historyTitle.className = 'checkin-history-title';
      historyTitle.textContent = '打卡记录（共 ' + checkins.length + ' 条）';
      history.appendChild(historyTitle);

      var MAX_SHOW = 7;
      var showCount = Math.min(checkins.length, MAX_SHOW);
      var collapsed = checkins.length > MAX_SHOW;

      // 渲染指定范围的记录
      function renderCheckinRows(start, end) {
        var frag = document.createDocumentFragment();
        for (var c = start; c < end; c++) {
          var ch = checkins[c];
          var row = buildCheckinRow(subjectId, round, ch);
          frag.appendChild(row);
        }
        return frag;
      }

      var visibleWrap = document.createElement('div');
      visibleWrap.className = 'checkin-visible';
      visibleWrap.appendChild(renderCheckinRows(0, showCount));
      history.appendChild(visibleWrap);

      // 折叠区域（超出7条的部分）
      if (collapsed) {
        var foldWrap = document.createElement('div');
        foldWrap.className = 'checkin-fold';
        foldWrap.style.display = 'none';
        foldWrap.appendChild(renderCheckinRows(MAX_SHOW, checkins.length));
        history.appendChild(foldWrap);

        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'checkin-toggle';
        toggleBtn.textContent = '展开全部（' + checkins.length + ' 条）▾';
        toggleBtn.addEventListener('click', function () {
          var hidden = foldWrap.style.display === 'none';
          foldWrap.style.display = hidden ? 'block' : 'none';
          toggleBtn.textContent = hidden
            ? '收起 ▴'
            : '展开全部（' + checkins.length + ' 条）▾';
        });
        history.appendChild(toggleBtn);
      }
    }
    card.appendChild(history);

    return card;
  }

  /* ---- 单条打卡记录行（含编辑按钮）---- */
  function buildCheckinRow(subjectId, round, ch) {
    var row = document.createElement('div');
    row.className = 'checkin-row';
    row.id = 'checkinRow_' + ch.id;

    // 显示模式
    var display = document.createElement('div');
    display.className = 'checkin-display';
    display.innerHTML =
      '<span class="checkin-date">' + escHtml(ch.date) + '</span>' +
      '<span class="checkin-amount">' + ch.amount + ' ' + escHtml(round.unit) + '</span>' +
      '<span class="checkin-title">' + escHtml(ch.title || '') + '</span>' +
      (ch.note ? '<span class="checkin-note">' + escHtml(ch.note) + '</span>' : '');

    // 操作按钮
    var ops = document.createElement('span');
    ops.className = 'checkin-row-ops';

    var editBtn = document.createElement('button');
    editBtn.className = 'checkin-edit';
    editBtn.textContent = '✎';
    editBtn.title = '编辑此打卡';
    editBtn.addEventListener('click', function () {
      toggleEditForm(ch.id);
    });
    ops.appendChild(editBtn);

    var delBtn = document.createElement('button');
    delBtn.className = 'checkin-del';
    delBtn.textContent = '×';
    delBtn.title = '删除此打卡';
    delBtn.addEventListener('click', function () {
      Modal.confirm('删除这条打卡记录？', function (ok) {
        if (!ok) return;
        Store.deleteCheckin(subjectId, round.id, ch.id);
        render();
        if (typeof Tasks !== 'undefined') Tasks.render();
        if (typeof Checkin !== 'undefined') Checkin.render();
      });
    });
    ops.appendChild(delBtn);

    display.appendChild(ops);
    row.appendChild(display);

    // 编辑表单（默认隐藏）
    var editForm = document.createElement('div');
    editForm.className = 'checkin-edit-form';
    editForm.id = 'editForm_' + ch.id;
    editForm.style.display = 'none';
    editForm.innerHTML =
      '<div class="ef-row">' +
        '<input type="date" class="ef-date" value="' + ch.date + '">' +
        '<input type="number" class="ef-amount" value="' + ch.amount +
          '" min="0" placeholder="' + escAttr(round.unit) + '" style="width:70px">' +
      '</div>' +
      '<div class="ef-row">' +
        '<input type="text" class="ef-title" value="' + escAttr(ch.title || '') +
          '" placeholder="打卡标题" style="flex:1">' +
      '</div>' +
      '<div class="ef-row">' +
        '<input type="text" class="ef-note" value="' + escAttr(ch.note || '') +
          '" placeholder="备注（可选）" style="flex:1">' +
      '</div>' +
      '<div class="ef-btns">' +
        '<button class="btn btn-sm btn-primary ef-save">保存</button>' +
        '<button class="btn btn-sm btn-ghost ef-cancel">取消</button>' +
      '</div>';

    editForm.querySelector('.ef-save').addEventListener('click', function () {
      var newDate   = editForm.querySelector('.ef-date').value;
      var newAmount = parseInt(editForm.querySelector('.ef-amount').value, 10);
      var newTitle  = editForm.querySelector('.ef-title').value.trim();
      var newNote   = editForm.querySelector('.ef-note').value.trim();
      if (!newDate) { alert('请选择日期'); return; }
      if (isNaN(newAmount) || newAmount < 0) { alert('请输入有效的完成数量'); return; }
      Store.updateCheckin(subjectId, round.id, ch.id, {
        date: newDate, amount: newAmount, title: newTitle, note: newNote
      });
      render();
      if (typeof Tasks !== 'undefined') Tasks.render();
      if (typeof Checkin !== 'undefined') Checkin.render();
    });

    editForm.querySelector('.ef-cancel').addEventListener('click', function () {
      editForm.style.display = 'none';
      display.style.display = '';
    });

    row.appendChild(editForm);
    return row;
  }

  /* ---- 切换编辑表单显示 ---- */
  function toggleEditForm(checkinId) {
    var row     = document.getElementById('checkinRow_' + checkinId);
    var display = row.querySelector('.checkin-display');
    var form    = document.getElementById('editForm_' + checkinId);
    if (!row || !display || !form) return;
    var editing = form.style.display !== 'none';
    if (editing) {
      form.style.display = 'none';
      display.style.display = '';
    } else {
      display.style.display = 'none';
      form.style.display = 'flex';
      form.querySelector('.ef-amount').focus();
    }
  }

  /* ---- 轮次表单（新建/编辑共用）---- */
  function buildRoundForm(subjectId, existingRound, wrapper) {
    var isEdit = !!existingRound;
    var form = document.createElement('div');
    form.className = 'round-form';

    var title = document.createElement('div');
    title.className = 'form-title';
    title.textContent = isEdit ? '编辑轮次' : '新增学习轮次';
    form.appendChild(title);

    // 轮次名称
    form.appendChild(formField('轮次名称',
      '<input type="text" class="rf-name" placeholder="例如：第一轮基础课" value="' +
      (isEdit ? escAttr(existingRound.name) : '') + '">'));

    // 截止日期
    form.appendChild(formField('截止日期',
      '<input type="date" class="rf-deadline" value="' +
      (isEdit ? existingRound.deadline : '') + '">'));

    // 总工作量 + 单位
    var row = document.createElement('div');
    row.className = 'form-row-dual';
    row.innerHTML =
      '<div class="form-field" style="flex:2"><label>总工作量</label>' +
      '<input type="number" class="rf-total" placeholder="例如：100" min="1" value="' +
      (isEdit ? existingRound.totalWork : '') + '"></div>' +
      '<div class="form-field" style="flex:1"><label>单位</label>' +
      '<input type="text" class="rf-unit" placeholder="课时" value="' +
      (isEdit ? escAttr(existingRound.unit) : '课时') + '"></div>';
    form.appendChild(row);

    // 每日上限 + 最低保底
    var row2 = document.createElement('div');
    row2.className = 'form-row-dual';
    row2.innerHTML =
      '<div class="form-field" style="flex:1"><label>每日最大可承受量</label>' +
      '<input type="number" class="rf-maxcap" placeholder="6" min="1" value="' +
      (isEdit ? (existingRound.maxDailyCapacity || 6) : '6') + '"></div>' +
      '<div class="form-field" style="flex:1"><label>最低保底数量</label>' +
      '<input type="number" class="rf-minamt" placeholder="1" min="0" value="' +
      (isEdit ? (existingRound.minTaskAmount || 1) : '1') + '"></div>';
    form.appendChild(row2);

    // 最低保底开关
    var minRow = document.createElement('div');
    minRow.className = 'form-field';
    minRow.innerHTML =
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
      '<input type="checkbox" class="rf-minenabled" style="width:auto;"' +
      (isEdit && existingRound.minTaskEnabled ? ' checked' : '') + '>' +
      '启用最低保底任务</label>';
    form.appendChild(minRow);

    // 按钮
    var btns = document.createElement('div');
    btns.className = 'form-btns';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-ghost';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', function () { wrapper.style.display = 'none'; });
    btns.appendChild(cancelBtn);

    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-sm btn-primary';
    submitBtn.textContent = isEdit ? '保存修改' : '创建轮次';
    submitBtn.addEventListener('click', function () {
      var data = {
        name: form.querySelector('.rf-name').value.trim(),
        deadline: form.querySelector('.rf-deadline').value,
        totalWork: parseInt(form.querySelector('.rf-total').value, 10) || 0,
        unit: form.querySelector('.rf-unit').value.trim() || '课时',
        maxDailyCapacity: parseInt(form.querySelector('.rf-maxcap').value, 10) || 6,
        minTaskEnabled: form.querySelector('.rf-minenabled').checked,
        minTaskAmount: parseInt(form.querySelector('.rf-minamt').value, 10) || 1
      };
      if (!data.name) { alert('请输入轮次名称'); return; }
      if (!data.totalWork || data.totalWork <= 0) { alert('请输入有效的总工作量'); return; }

      if (isEdit) {
        Store.updateRound(subjectId, existingRound.id, data);
      } else {
        Store.addRound(subjectId, data);
      }
      wrapper.style.display = 'none';
      render();
      if (typeof Tasks !== 'undefined') Tasks.render();
    });
    btns.appendChild(submitBtn);
    form.appendChild(btns);

    return form;
  }

  /* ---- 打卡表单 ---- */
  function buildCheckinForm(subjectId, round, wrapper) {
    var form = document.createElement('div');
    form.className = 'checkin-form';

    var title = document.createElement('div');
    title.className = 'form-title';
    title.textContent = '今日打卡 — ' + round.name;
    form.appendChild(title);

    form.appendChild(formField('今日完成数量（' + round.unit + '）',
      '<input type="number" class="cf-amount" placeholder="例如：3" min="1" value="' +
      Progress.getDailyPlan(round) + '">'));

    form.appendChild(formField('打卡标题',
      '<input type="text" class="cf-title" placeholder="例如：完成存货章节学习">'));

    form.appendChild(formField('备注（可选）',
      '<input type="text" class="cf-note" placeholder="例如：做题正确率80%">'));

    var btns = document.createElement('div');
    btns.className = 'form-btns';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-ghost';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', function () { wrapper.style.display = 'none'; });
    btns.appendChild(cancelBtn);

    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-sm btn-primary';
    submitBtn.textContent = '提交打卡';
    submitBtn.addEventListener('click', function () {
      var amount = parseInt(form.querySelector('.cf-amount').value, 10) || 0;
      if (amount <= 0) { alert('请输入有效的完成数量'); return; }
      var data = {
        date: Store.today(),
        amount: amount,
        title: form.querySelector('.cf-title').value.trim(),
        note: form.querySelector('.cf-note').value.trim()
      };
      Store.addCheckin(subjectId, round.id, data);
      wrapper.style.display = 'none';
      render();
      if (typeof Tasks !== 'undefined') Tasks.render();
      if (typeof Checkin !== 'undefined') Checkin.render();
    });
    btns.appendChild(submitBtn);
    form.appendChild(btns);

    return form;
  }

  /* ---- 工具：表单字段 ---- */
  function formField(label, innerHtml) {
    var div = document.createElement('div');
    div.className = 'form-field';
    div.innerHTML = '<label>' + label + '</label>' + innerHtml;
    return div;
  }

  /* ---- 显示/隐藏表单 ---- */
  function showAddRoundForm(subjectId) {
    var wrap = document.getElementById('roundForm_' + subjectId);
    if (wrap) wrap.style.display = 'block';
  }

  function showEditRoundForm(subjectId, round) {
    var wrap = document.getElementById('roundForm_' + subjectId);
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.appendChild(buildRoundForm(subjectId, round, wrap));
    wrap.style.display = 'block';
  }

  function toggleCheckinForm(subjectId, roundId) {
    var wrap = document.getElementById('checkinForm_' + roundId);
    if (!wrap) return;
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
  }

  /* ---- HTML 转义 ---- */
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ---- 添加科目 ---- */
  function addSubject() {
    var name = els.input.value.trim();
    if (!name) return;
    Store.addSubject(name);
    els.input.value = '';
    render();
    if (typeof Tasks !== 'undefined') Tasks.render();
  }

  /* ---- 事件绑定 ---- */
  function bindEvents() {
    els.btnAdd.addEventListener('click', addSubject);
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addSubject();
    });
  }

  /* ---- 初始化 ---- */
  function init() {
    els.input  = document.getElementById('subjectInput');
    els.btnAdd = document.getElementById('subjectBtnAdd');
    els.list   = document.getElementById('subjectList');
    bindEvents();
    render();
  }

  return { init: init, render: render };
})();
