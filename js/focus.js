/* ================================================================
   focus.js - focus timer, study duration records, daily summary
   ================================================================ */

var Focus = (function () {
  'use strict';

  var state = null;
  var tickId = null;
  var pressTimer = null;
  var longPressed = false;
  var showAllRecords = false;

  function init() {
    bindStartButtons();
    bindTimerControls();
    bindSummaryButtons();
    ensureRecordPanel();
    renderRecords();
  }

  function bindStartButtons() {
    var buttons = document.querySelectorAll('.focus-start-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        var minutes = parseInt(this.dataset.minutes, 10);
        this.classList.add('tap');
        var btn = this;
        setTimeout(function () { btn.classList.remove('tap'); }, 180);
        chooseSubject(minutes);
      });
    }
  }

  function bindTimerControls() {
    var area = document.getElementById('focusTimerArea');
    var endBtn = document.getElementById('focusEndBtn');
    if (!area) return;

    area.addEventListener('click', function () {
      if (longPressed) { longPressed = false; return; }
      togglePause();
    });
    area.addEventListener('mousedown', startLongPress);
    area.addEventListener('touchstart', startLongPress, { passive: true });
    area.addEventListener('mouseup', clearLongPress);
    area.addEventListener('mouseleave', clearLongPress);
    area.addEventListener('touchend', clearLongPress);
    area.addEventListener('touchcancel', clearLongPress);

    if (endBtn) endBtn.addEventListener('click', confirmEnd);
  }

  function bindSummaryButtons() {
    var gen = document.getElementById('btnGenerateSummary');
    var copy = document.getElementById('btnCopySummary');
    if (gen) gen.addEventListener('click', function () {
      var out = document.getElementById('focusSummaryOutput');
      if (out) out.value = generateDailySummary();
    });
    if (copy) copy.addEventListener('click', copySummary);
  }

  function chooseSubject(minutes) {
    var subjects = Store.getSubjects();
    if (!subjects.length) { alert('请先在学习计划中添加科目'); return; }
    var body = '<div class="focus-subject-list">';
    for (var i = 0; i < subjects.length; i++) {
      body += '<button class="focus-subject-option" type="button" data-id="' + escAttr(subjects[i].id) + '">' + esc(subjects[i].name) + '</button>';
    }
    body += '</div>';
    showModal({
      title: '选择学习科目',
      body: body,
      buttons: [{ text: '取消', value: 'cancel', cls: 'btn-ghost' }],
      onReady: function (overlay) {
        var options = overlay.querySelectorAll('.focus-subject-option');
        for (var j = 0; j < options.length; j++) {
          options[j].addEventListener('click', function () {
            startTimer(minutes, this.dataset.id);
            overlay.remove();
          });
        }
      }
    });
  }

  function startTimer(minutes, subjectId) {
    var subject = findSubject(subjectId);
    state = {
      plannedMinutes: minutes,
      subjectId: subjectId,
      subjectName: subject ? subject.name : '未知科目',
      remainingSeconds: minutes * 60,
      elapsedSeconds: 0,
      running: true,
      startedAt: new Date()
    };
    var startRow = document.getElementById('focusStartRow');
    var panel = document.getElementById('focusTimerPanel');
    if (startRow) startRow.style.display = 'none';
    if (panel) panel.style.display = 'block';
    setText('focusSubjectName', state.subjectName);
    renderTimer();
    if (tickId) clearInterval(tickId);
    tickId = setInterval(tick, 1000);
  }

  function tick() {
    if (!state || !state.running) return;
    state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
    state.elapsedSeconds += 1;
    renderTimer();
    if (state.remainingSeconds <= 0) finishFlow();
  }

  function togglePause() {
    if (!state) return;
    state.running = !state.running;
    renderTimer();
  }

  function startLongPress() {
    if (!state) return;
    clearLongPress();
    longPressed = false;
    pressTimer = setTimeout(function () {
      longPressed = true;
      confirmEnd();
    }, 700);
  }

  function clearLongPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  function confirmEnd() {
    if (!state) return;
    var wasRunning = state.running;
    state.running = false;
    renderTimer();
    showModal({
      title: '确认结束本次学习？',
      buttons: [
        { text: '继续学习', value: 'continue', cls: 'btn-ghost' },
        { text: '结束学习', value: 'end', cls: 'btn-primary' }
      ],
      onAction: function (value) {
        if (value === 'end') finishFlow();
        else { state.running = wasRunning; renderTimer(); }
      }
    });
  }

  function finishFlow() {
    if (!state) return;
    if (tickId) clearInterval(tickId);
    tickId = null;
    state.running = false;
    showFinishDialog(Math.max(1, Math.round(state.elapsedSeconds / 60)));
  }

  function showFinishDialog(actualMinutes, overlay) {
    var target = overlay || null;
    var body = '<div class="focus-finish-info">' +
      '<div>本次计划时间：<b>' + state.plannedMinutes + '分钟</b></div>' +
      '<div>实际学习时间：<b id="focusActualText">' + actualMinutes + '分钟</b></div>' +
    '</div>';

    if (!target) {
      target = showModal({ title: '', body: '', buttons: [] });
    }

    renderFinishContent(target, actualMinutes, body);
  }

  function renderFinishContent(overlay, actualMinutes, body) {
    var card = overlay.querySelector('.modal-card');
    card.innerHTML = '<p class="modal-msg">本次学习记录</p>' + body +
      '<div class="modal-btns">' +
      '<button class="btn btn-sm btn-primary" type="button" data-focus-finish="save">计入学习时长</button>' +
      '<button class="btn btn-sm btn-ghost" type="button" data-focus-finish="skip">不计入</button>' +
      '<button class="btn btn-sm btn-ghost" type="button" data-focus-finish="edit">修改时间</button>' +
      '</div>';

    card.querySelector('[data-focus-finish="save"]').addEventListener('click', function (e) {
      e.stopPropagation();
      saveSession(actualMinutes, actualMinutes >= state.plannedMinutes ? 'completed' : 'partial');
      overlay.remove();
      resetTimerUI();
    });
    card.querySelector('[data-focus-finish="skip"]').addEventListener('click', function (e) {
      e.stopPropagation();
      saveSession(actualMinutes, 'skipped');
      overlay.remove();
      resetTimerUI();
    });
    card.querySelector('[data-focus-finish="edit"]').addEventListener('click', function (e) {
      e.stopPropagation();
      showEditActualContent(overlay, actualMinutes);
    });
  }

  function showEditActualContent(overlay, currentMinutes) {
    var card = overlay.querySelector('.modal-card');
    card.innerHTML = '<p class="modal-msg">修改实际学习时间</p>' +
      '<div class="form-field focus-modal-field"><label>实际学习分钟数</label>' +
      '<input type="number" id="focusActualInput" min="0" value="' + currentMinutes + '"></div>' +
      '<div class="modal-btns">' +
      '<button class="btn btn-sm btn-ghost" type="button" data-focus-edit="back">返回</button>' +
      '<button class="btn btn-sm btn-primary" type="button" data-focus-edit="save">保存</button>' +
      '</div>';
    card.querySelector('[data-focus-edit="back"]').addEventListener('click', function (e) {
      e.stopPropagation();
      showFinishDialog(currentMinutes, overlay);
    });
    card.querySelector('[data-focus-edit="save"]').addEventListener('click', function (e) {
      e.stopPropagation();
      var input = document.getElementById('focusActualInput');
      var parsed = parseInt(input.value, 10);
      if (isNaN(parsed) || parsed < 0) { alert('请输入有效分钟数'); return; }
      showFinishDialog(parsed, overlay);
    });
    setTimeout(function () {
      var input = document.getElementById('focusActualInput');
      if (input) input.focus();
    }, 0);
  }

  function saveSession(actualMinutes, status) {
    Store.addFocusSession({
      user_id: SupabaseStorage && SupabaseStorage.getCurrentUser() ? SupabaseStorage.getCurrentUser().id : '',
      date: Store.today(),
      subject_id: state.subjectId,
      planned_minutes: state.plannedMinutes,
      actual_minutes: actualMinutes,
      status: status,
      source: 'focus_timer',
      created_at: new Date().toISOString()
    });
    renderDependents();
  }

  function resetTimerUI() {
    state = null;
    var startRow = document.getElementById('focusStartRow');
    var panel = document.getElementById('focusTimerPanel');
    if (startRow) startRow.style.display = '';
    if (panel) panel.style.display = 'none';
    renderTimer();
  }

  function renderTimer() {
    var time = document.getElementById('focusTimeLeft');
    var stateText = document.getElementById('focusStateText');
    if (!state) {
      if (time) time.textContent = '00:00';
      if (stateText) stateText.textContent = '';
      return;
    }
    if (time) time.textContent = formatClock(state.remainingSeconds);
    if (stateText) stateText.textContent = state.running ? '计时中' : '已暂停，短按继续';
  }

  function getSubjectFocusStats(subjectId) {
    var sessions = Store.getFocusSessions ? Store.getFocusSessions() : [];
    var today = Store.today();
    var weekStart = getWeekStart(today);
    var todayMinutes = 0, weekMinutes = 0, totalMinutes = 0;
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (s.subject_id !== subjectId || s.status === 'skipped') continue;
      var mins = Number(s.actual_minutes || 0);
      totalMinutes += mins;
      if (s.date === today) todayMinutes += mins;
      if (s.date >= weekStart && s.date <= today) weekMinutes += mins;
    }
    return { today: todayMinutes, week: weekMinutes, total: totalMinutes };
  }

  function editTodayFocusMinutes(subjectId) {
    var subject = findSubject(subjectId);
    var stats = getSubjectFocusStats(subjectId);
    var overlay = showModal({
      title: '修改今日学习时长',
      body: '<div class="focus-finish-info"><div>科目：<b>' + esc(subject ? subject.name : '未知科目') + '</b></div></div>' +
        '<div class="form-field focus-modal-field"><label>今日学习分钟数</label>' +
        '<input type="number" id="focusTodayMinutesInput" min="0" value="' + stats.today + '"></div>',
      buttons: [
        { text: '取消', value: 'cancel', cls: 'btn-ghost' },
        { text: '保存', value: 'save', cls: 'btn-primary' }
      ],
      onAction: function (value) {
        if (value !== 'save') return;
        var input = document.getElementById('focusTodayMinutesInput');
        var minutes = parseInt(input.value, 10);
        if (isNaN(minutes) || minutes < 0) { alert('请输入有效分钟数'); return false; }
        setTodayFocusMinutes(subjectId, minutes);
        renderDependents();
      }
    });
    setTimeout(function () {
      var input = overlay.querySelector('#focusTodayMinutesInput');
      if (input) input.focus();
    }, 0);
  }

  function setTodayFocusMinutes(subjectId, minutes) {
    var today = Store.today();
    var sessions = Store.getFocusSessions ? Store.getFocusSessions() : [];
    var kept = [];
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (s.subject_id === subjectId && s.date === today && s.status !== 'skipped') continue;
      kept.push(s);
    }
    if (minutes > 0) {
      kept.unshift({
        id: Store.uid('fs'),
        user_id: SupabaseStorage && SupabaseStorage.getCurrentUser() ? SupabaseStorage.getCurrentUser().id : '',
        date: today,
        subject_id: subjectId,
        planned_minutes: minutes,
        actual_minutes: minutes,
        status: 'completed',
        source: 'focus_timer',
        created_at: new Date().toISOString()
      });
    }
    Store.saveFocusSessions(kept);
  }

  function generateDailySummary() {
    var today = Store.today();
    var subjects = Store.getSubjects();
    var examDays = Progress.getRemainingDays(Store.getExamDate());
    var lines = ['CPA学习日报', '', '日期：' + today, '', '距离考试：' + examDays + '天', '', '今日学习时间：'];
    for (var i = 0; i < subjects.length; i++) {
      var stats = getSubjectFocusStats(subjects[i].id);
      lines.push(subjects[i].name + '：' + formatMinutes(stats.today));
    }
    lines.push('', '今日轮次完成：');
    for (var s = 0; s < subjects.length; s++) {
      var rounds = subjects[s].rounds || [];
      if (!rounds.length) { lines.push(subjects[s].name + '：未设置轮次'); continue; }
      for (var r = 0; r < rounds.length; r++) {
        var todayDone = Progress.getTodayCheckinTotal(rounds[r]);
        lines.push(subjects[s].name + rounds[r].name + '：' + (todayDone > 0 ? ('完成' + todayDone + rounds[r].unit) : '未完成'));
      }
    }
    lines.push('', '累计学习时间：');
    for (var j = 0; j < subjects.length; j++) {
      lines.push(subjects[j].name + '：' + formatMinutes(getSubjectFocusStats(subjects[j].id).total));
    }
    lines.push('', '当前计划完成情况：');
    for (var k = 0; k < subjects.length; k++) {
      var rs = subjects[k].rounds || [];
      if (!rs.length) { lines.push(subjects[k].name + '：暂无学习轮次'); continue; }
      for (var x = 0; x < rs.length; x++) {
        var status = Progress.getProgressStatus(rs[x]);
        lines.push(subjects[k].name + rs[x].name + '：' + status.label + '，已完成' + Progress.getCompletedWork(rs[x]) + '/' + (rs[x].totalWork || 0) + rs[x].unit);
      }
    }
    return lines.join('\n');
  }

  function copySummary() {
    var out = document.getElementById('focusSummaryOutput');
    var text = out && out.value ? out.value : generateDailySummary();
    if (out) out.value = text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { alert('学习摘要已复制，可以发送给GPT分析明日计划。'); });
    } else {
      if (out) { out.focus(); out.select(); document.execCommand('copy'); }
      alert('学习摘要已复制，可以发送给GPT分析明日计划。');
    }
  }

  function ensureRecordPanel() {
    var card = document.querySelector('.focus-summary-card');
    if (!card || document.getElementById('focusRecordsPanel')) return;
    var panel = document.createElement('div');
    panel.id = 'focusRecordsPanel';
    panel.className = 'focus-records-panel';
    card.appendChild(panel);
  }

  function renderRecords() {
    var panel = document.getElementById('focusRecordsPanel');
    if (!panel) return;
    var sessions = Store.getFocusSessions ? Store.getFocusSessions() : [];
    var subjects = Store.getSubjects();
    var names = {};
    for (var i = 0; i < subjects.length; i++) names[subjects[i].id] = subjects[i].name;
    var limit = showAllRecords ? sessions.length : 7;
    var html = '<div class="focus-records-title">学习记录</div>';
    if (!sessions.length) html += '<div class="task-empty">暂无学习记录</div>';
    for (var j = 0; j < Math.min(sessions.length, limit); j++) {
      var s = sessions[j];
      html += '<div class="focus-record-row" data-id="' + escAttr(s.id) + '">' +
        '<span>' + esc(formatSessionStart(s)) + '</span><span>' + esc(names[s.subject_id] || '未知科目') + '</span>' +
        '<span>' + s.actual_minutes + '分钟</span><span>' + esc(statusText(s.status)) + '</span>' +
        '<button class="focus-record-delete" type="button" aria-label="删除学习记录">×</button></div>';
    }
    if (sessions.length > 7) {
      html += '<button class="focus-record-toggle" type="button">' +
        (showAllRecords ? '收起学习记录' : '展开全部学习记录（' + sessions.length + '条）') + '</button>';
    }
    panel.innerHTML = html;
    var dels = panel.querySelectorAll('.focus-record-delete');
    for (var d = 0; d < dels.length; d++) dels[d].addEventListener('click', deleteRecord);
    var toggle = panel.querySelector('.focus-record-toggle');
    if (toggle) toggle.addEventListener('click', function () { showAllRecords = !showAllRecords; renderRecords(); });
  }

  function deleteRecord(e) {
    var id = e.target.parentNode.dataset.id;
    showModal({
      title: '删除这条学习记录？',
      buttons: [
        { text: '取消', value: 'cancel', cls: 'btn-ghost' },
        { text: '删除', value: 'delete', cls: 'btn-primary' }
      ],
      onAction: function (value) {
        if (value === 'delete') {
          Store.deleteFocusSession(id);
          renderDependents();
        }
      }
    });
  }

  function renderDependents() {
    if (typeof Checkin !== 'undefined' && Checkin.render) Checkin.render();
    renderRecords();
    var out = document.getElementById('focusSummaryOutput');
    if (out && out.value) out.value = generateDailySummary();
  }

  function showModal(options) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var body = options.body || '';
    var buttons = options.buttons || [];
    var html = '<div class="modal-card"><p class="modal-msg">' + esc(options.title || '') + '</p>' + body + '<div class="modal-btns">';
    for (var i = 0; i < buttons.length; i++) {
      html += '<button class="btn btn-sm ' + (buttons[i].cls || 'btn-ghost') + '" data-action="' + escAttr(buttons[i].value) + '">' + esc(buttons[i].text) + '</button>';
    }
    html += '</div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { overlay.remove(); return; }
      var action = e.target.dataset.action;
      if (!action) return;
      var keep = options.keepOpenValues && options.keepOpenValues.indexOf(action) !== -1;
      var result;
      if (options.onAction) result = options.onAction(action, overlay);
      if (!keep && result !== false) overlay.remove();
    });
    if (options.onReady) options.onReady(overlay);
    return overlay;
  }

  function findSubject(id) {
    var subjects = Store.getSubjects();
    for (var i = 0; i < subjects.length; i++) if (subjects[i].id === id) return subjects[i];
    return null;
  }

  function getWeekStart(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatClock(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function formatMinutes(mins) {
    mins = Number(mins || 0);
    if (mins < 60) return mins + '分钟';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + '小时' + (m ? m + '分钟' : '');
  }

  function formatSessionStart(session) {
    var raw = session.created_at || session.createdAt || '';
    if (raw) {
      var d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return session.date + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
    }
    return session.date || '';
  }
  function statusText(status) {
    if (status === 'completed') return '已完成';
    if (status === 'partial') return '部分完成';
    if (status === 'skipped') return '不计入';
    return status || '';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return {
    init: init,
    getSubjectFocusStats: getSubjectFocusStats,
    editTodayFocusMinutes: editTodayFocusMinutes,
    generateDailySummary: generateDailySummary,
    formatMinutes: formatMinutes,
    renderRecords: renderRecords
  };
})();