/* ================================================================
   store.js — localStorage 统一读写工具
   数据结构 v2：轮次 + 打卡内嵌在科目里
   ================================================================ */

var Store = (function () {
  'use strict';

  var KEY_EXAM_DATE    = 'cpa_exam_date';
  var KEY_SUBJECTS     = 'cpa_subjects';
  var KEY_TASKS        = 'cpa_tasks';
  var KEY_MANUAL_TASKS = 'cpa_manual_tasks';
  var KEY_MISTAKES     = 'cpa_mistakes';

  var DEFAULT_EXAM_DATE = '2026-08-23';

  /* ---- 默认科目（首次使用时写入）---- */
  function makeDefaults() {
    var now = new Date().toISOString();
    return [
      { id: 's_001', name: '会计',   rounds: [], createdAt: now },
      { id: 's_002', name: '审计',   rounds: [], createdAt: now },
      { id: 's_003', name: '经济法', rounds: [], createdAt: now }
    ];
  }

  /* ========== 内部工具 ========== */

  function getItem(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function setItem(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('[Store] 写入失败：' + key, e); }
  }

  function uid(prefix) {
    return (prefix || 'x') + '_' +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ========== 1. 考试日期 ========== */

  function getExamDate() {
    return localStorage.getItem(KEY_EXAM_DATE) || DEFAULT_EXAM_DATE;
  }

  function setExamDate(dateStr) {
    localStorage.setItem(KEY_EXAM_DATE, dateStr);
  }

  /* ========== 2. 科目（含轮次和打卡）========== */

  function getSubjects() {
    var list = getItem(KEY_SUBJECTS, null);
    if (!list) {
      var def = makeDefaults();
      setItem(KEY_SUBJECTS, def);
      return JSON.parse(JSON.stringify(def));
    }
    // 兼容旧数据：确保每个科目都有 rounds 数组 + 补字段
    for (var i = 0; i < list.length; i++) {
      if (!list[i].rounds) list[i].rounds = [];
      for (var j = 0; j < list[i].rounds.length; j++) {
        var r = list[i].rounds[j];
        if (r.maxDailyCapacity === undefined) r.maxDailyCapacity = 6;
        if (!r.restDays) r.restDays = [];
        if (r.minTaskEnabled === undefined) r.minTaskEnabled = false;
        if (r.minTaskAmount === undefined) r.minTaskAmount = 1;
        if (r.minTaskType === undefined) r.minTaskType = 'amount';
        if (r.minTaskMinutes === undefined) r.minTaskMinutes = 30;
      }
    }
    return list;
  }

  function saveSubjects(list) {
    setItem(KEY_SUBJECTS, list);
    try { if (typeof Sync !== 'undefined') Sync.scheduleUpload(); } catch (e) {}
  }

  /** 按 ID 查找科目，返回 { subject, index } 或 null */
  function findSubject(subjectId) {
    var list = getSubjects();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === subjectId) return { subject: list[i], index: i, all: list };
    }
    return null;
  }

  /** 按 ID 查找轮次 */
  function findRound(subjectId, roundId) {
    var result = findSubject(subjectId);
    if (!result) return null;
    var rounds = result.subject.rounds || [];
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i].id === roundId) {
        return { subject: result.subject, round: rounds[i], index: i, all: result.all };
      }
    }
    return null;
  }

  /* ---- 科目增删改 ---- */

  function addSubject(name) {
    var list = getSubjects();
    list.push({
      id: uid('s'),
      name: name,
      rounds: [],
      createdAt: new Date().toISOString()
    });
    saveSubjects(list);
  }

  function updateSubject(subjectId, newName) {
    var result = findSubject(subjectId);
    if (!result) return;
    result.subject.name = newName;
    saveSubjects(result.all);
  }

  function deleteSubject(subjectId) {
    var list = getSubjects();
    saveSubjects(list.filter(function (s) { return s.id !== subjectId; }));
  }

  /** 拖拽排序：把 fromIndex 的科目移到 toIndex */
  function reorderSubjects(fromIndex, toIndex) {
    var list = getSubjects();
    if (fromIndex < 0 || fromIndex >= list.length) return;
    if (toIndex < 0 || toIndex >= list.length) return;
    var item = list.splice(fromIndex, 1)[0];
    list.splice(toIndex, 0, item);
    saveSubjects(list);
  }

  /* ---- 轮次增删改 ---- */

  function addRound(subjectId, roundData) {
    var result = findSubject(subjectId);
    if (!result) return null;
    var round = {
      id: uid('r'),
      name: roundData.name || '',
      deadline: roundData.deadline || '',
      totalWork: roundData.totalWork || 0,
      unit: roundData.unit || '课时',
      maxDailyCapacity: roundData.maxDailyCapacity || 6,
      minTaskEnabled: !!roundData.minTaskEnabled,
      minTaskAmount: roundData.minTaskAmount || 1,
      minTaskType: roundData.minTaskType || 'amount',
      minTaskMinutes: roundData.minTaskMinutes || 30,
      restDays: roundData.restDays || [],
      courseItems: [],
      checkins: [],
      createdAt: new Date().toISOString()
    };
    result.subject.rounds.push(round);
    saveSubjects(result.all);
    return round;
  }

  function updateRound(subjectId, roundId, roundData) {
    var result = findRound(subjectId, roundId);
    if (!result) return;
    if (roundData.name              !== undefined) result.round.name              = roundData.name;
    if (roundData.deadline          !== undefined) result.round.deadline          = roundData.deadline;
    if (roundData.totalWork         !== undefined) result.round.totalWork         = roundData.totalWork;
    if (roundData.unit              !== undefined) result.round.unit              = roundData.unit;
    if (roundData.maxDailyCapacity  !== undefined) result.round.maxDailyCapacity  = roundData.maxDailyCapacity;
    if (roundData.minTaskEnabled    !== undefined) result.round.minTaskEnabled    = roundData.minTaskEnabled;
    if (roundData.minTaskAmount     !== undefined) result.round.minTaskAmount     = roundData.minTaskAmount;
    if (roundData.minTaskType       !== undefined) result.round.minTaskType       = roundData.minTaskType;
    if (roundData.minTaskMinutes    !== undefined) result.round.minTaskMinutes    = roundData.minTaskMinutes;
    saveSubjects(result.all);
  }

  function deleteRound(subjectId, roundId) {
    var result = findRound(subjectId, roundId);
    if (!result) return;
    result.subject.rounds.splice(result.index, 1);
    saveSubjects(result.all);
  }

  /* ---- 打卡增删 ---- */

  function addCheckin(subjectId, roundId, data) {
    var result = findRound(subjectId, roundId);
    if (!result) return null;
    var checkin = {
      id: uid('c'),
      date: data.date || today(),
      amount: data.amount || 0,
      title: data.title || '',
      note: data.note || ''
    };
    if (!result.round.checkins) result.round.checkins = [];
    result.round.checkins.unshift(checkin); // 最新的在前
    saveSubjects(result.all);
    return checkin;
  }

  function deleteCheckin(subjectId, roundId, checkinId) {
    var result = findRound(subjectId, roundId);
    if (!result) return;
    result.round.checkins = result.round.checkins.filter(function (c) {
      return c.id !== checkinId;
    });
    saveSubjects(result.all);
  }

  function updateCheckin(subjectId, roundId, checkinId, data) {
    var result = findRound(subjectId, roundId);
    if (!result) return;
    var checks = result.round.checkins || [];
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].id === checkinId) {
        if (data.date   !== undefined) checks[i].date   = data.date;
        if (data.amount !== undefined) checks[i].amount = data.amount;
        if (data.title  !== undefined) checks[i].title  = data.title;
        if (data.note   !== undefined) checks[i].note   = data.note;
        break;
      }
    }
    saveSubjects(result.all);
  }

  /* ---- 打卡统计（跨所有科目和轮次）---- */

  /** 获取所有有打卡记录的日期集合 */
  function getAllCheckinDates() {
    var subjects = getSubjects();
    var dateSet = {};
    for (var i = 0; i < subjects.length; i++) {
      var rounds = subjects[i].rounds || [];
      for (var j = 0; j < rounds.length; j++) {
        var checks = rounds[j].checkins || [];
        for (var k = 0; k < checks.length; k++) {
          dateSet[checks[k].date] = true;
        }
      }
    }
    return dateSet;
  }

  /** 连续打卡天数 */
  function getStreak() {
    var dateSet = getAllCheckinDates();
    var streak  = 0;
    var d       = new Date();
    var td      = today();

    while (true) {
      var ds = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      if (dateSet[ds]) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        // 今天还没打卡，不算断档
        if (ds === td) {
          d.setDate(d.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return streak;
  }

  /** 获取某天的打卡记录摘要 */
  function getCheckinsForDate(dateStr) {
    var subjects = getSubjects();
    var result = [];
    for (var i = 0; i < subjects.length; i++) {
      var rounds = subjects[i].rounds || [];
      for (var j = 0; j < rounds.length; j++) {
        var checks = rounds[j].checkins || [];
        for (var k = 0; k < checks.length; k++) {
          if (checks[k].date === dateStr) {
            result.push({
              subjectName: subjects[i].name,
              roundName: rounds[j].name,
              amount: checks[k].amount,
              unit: rounds[j].unit,
              title: checks[k].title
            });
          }
        }
      }
    }
    return result;
  }

  /* ========== 3. 手动任务（新版，iPhone 提醒事项风格）========== */

  /** 迁移旧任务到新格式 */
  function migrateOldTasks() {
    var old = getItem(KEY_TASKS, null);
    if (!old || old.length === 0) return;
    var migrated = [];
    for (var i = 0; i < old.length; i++) {
      var t = old[i];
      migrated.push({
        id: t.id || uid('mt'),
        title: t.name || t.title || '',
        subjectId: t.subjectId || '',
        createdAt: t.createdAt || new Date().toISOString(),
        completedAt: t.done ? (t.date || today()) : null,
        dueAt: t.dueAt || null,
        isCompleted: !!t.done,
        note: t.note || ''
      });
    }
    // 保留旧 key 做备份，新数据写入 cpa_manual_tasks
    var existingManual = getManualTasks();
    if (existingManual.length === 0) {
      setItem(KEY_MANUAL_TASKS, migrated);
    }
    // 清除旧 key（只执行一次）
    localStorage.removeItem(KEY_TASKS);
  }

  function getManualTasks() {
    migrateOldTasks(); // 自动迁移
    var list = getItem(KEY_MANUAL_TASKS, []);
    // 兼容补字段
    for (var i = 0; i < list.length; i++) {
      if (list[i].completedAt === undefined) list[i].completedAt = list[i].isCompleted ? (list[i].date || null) : null;
      if (list[i].dueAt === undefined) list[i].dueAt = null;
      if (list[i].note === undefined) list[i].note = '';
      if (list[i].title === undefined && list[i].name !== undefined) {
        list[i].title = list[i].name;
      }
      if (list[i].isCompleted === undefined && list[i].done !== undefined) {
        list[i].isCompleted = list[i].done;
      }
    }
    return list;
  }

  function saveManualTasks(list) {
    setItem(KEY_MANUAL_TASKS, list);
    try { if (typeof Sync !== 'undefined') Sync.scheduleUpload(); } catch (e) {}
  }

  function addManualTask(data) {
    var list = getManualTasks();
    list.unshift({
      id: uid('mt'),
      title: data.title || '',
      subjectId: data.subjectId || '',
      createdAt: new Date().toISOString(),
      completedAt: null,
      dueAt: data.dueAt || null,
      isCompleted: false,
      note: data.note || ''
    });
    saveManualTasks(list);
  }

  function updateManualTask(taskId, data) {
    var list = getManualTasks();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === taskId) {
        if (data.title      !== undefined) list[i].title      = data.title;
        if (data.subjectId  !== undefined) list[i].subjectId  = data.subjectId;
        if (data.dueAt      !== undefined) list[i].dueAt      = data.dueAt;
        if (data.note       !== undefined) list[i].note       = data.note;
        if (data.isCompleted !== undefined) {
          list[i].isCompleted = data.isCompleted;
          list[i].completedAt = data.isCompleted ? new Date().toISOString() : null;
        }
        break;
      }
    }
    saveManualTasks(list);
  }

  function deleteManualTask(taskId) {
    var list = getManualTasks();
    saveManualTasks(list.filter(function (t) { return t.id !== taskId; }));
  }

  function toggleManualTask(taskId) {
    var list = getManualTasks();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === taskId) {
        list[i].isCompleted = !list[i].isCompleted;
        list[i].completedAt = list[i].isCompleted ? new Date().toISOString() : null;
        break;
      }
    }
    saveManualTasks(list);
  }

  /* ---- 按科目打卡统计 ---- */

  /** 某科目今日已完成总量 */
  function getSubjectTodayCompleted(subject) {
    var td = today();
    var sum = 0;
    var rounds = subject.rounds || [];
    for (var i = 0; i < rounds.length; i++) {
      var checks = rounds[i].checkins || [];
      for (var j = 0; j < checks.length; j++) {
        if (checks[j].date === td) sum += (checks[j].amount || 0);
      }
    }
    return sum;
  }

  /** 某科目今日计划总量 */
  function getSubjectTodayPlanned(subject) {
    var sum = 0;
    var rounds = subject.rounds || [];
    for (var i = 0; i < rounds.length; i++) {
      var r = rounds[i];
      if ((r.totalWork || 0) > 0) {
        sum += (typeof Progress !== 'undefined' ? Progress.getDailyPlan(r) : 0);
      }
    }
    return sum;
  }

  /** 某科目最近一次打卡日期 */
  function getSubjectLastCheckinDate(subject) {
    var latest = '';
    var rounds = subject.rounds || [];
    for (var i = 0; i < rounds.length; i++) {
      var checks = rounds[i].checkins || [];
      for (var j = 0; j < checks.length; j++) {
        if (!latest || checks[j].date > latest) latest = checks[j].date;
      }
    }
    return latest;
  }

  /** 某科目连续打卡天数 */
  function getSubjectStreak(subject) {
    var dateSet = {};
    var rounds = subject.rounds || [];
    for (var i = 0; i < rounds.length; i++) {
      var checks = rounds[i].checkins || [];
      for (var j = 0; j < checks.length; j++) {
        dateSet[checks[j].date] = true;
      }
    }
    var streak = 0;
    var d = new Date();
    var td = today();
    while (true) {
      var ds = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      if (dateSet[ds]) { streak++; d.setDate(d.getDate() - 1); }
      else { if (ds === td) { d.setDate(d.getDate() - 1); continue; } break; }
    }
    return streak;
  }

  /* ---- 休息日管理 ---- */

  function addRestDay(subjectId, roundId, dateStr) {
    var result = findRound(subjectId, roundId);
    if (!result) return;
    if (!result.round.restDays) result.round.restDays = [];
    if (result.round.restDays.indexOf(dateStr) === -1) {
      result.round.restDays.push(dateStr);
    }
    saveSubjects(result.all);
  }

  function deleteRestDay(subjectId, roundId, dateStr) {
    var result = findRound(subjectId, roundId);
    if (!result) return;
    result.round.restDays = (result.round.restDays || []).filter(function (d) {
      return d !== dateStr;
    });
    saveSubjects(result.all);
  }

  /* ---- 数据导出/导入 ---- */

  function exportAllData() {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      examDate: getExamDate(),
      subjects: getSubjects(),
      manualTasks: getManualTasks(),
      mistakes: getMistakes()
    };
  }

  function validateImportData(json) {
    if (!json || typeof json !== 'object') return '数据格式无效：不是有效的 JSON 对象';
    if (!json.subjects || !Array.isArray(json.subjects)) return '数据缺少 subjects 字段或格式不正确';
    if (!json.manualTasks || !Array.isArray(json.manualTasks)) json.manualTasks = [];
    if (!json.mistakes || !Array.isArray(json.mistakes)) json.mistakes = [];
    return null; // null = 校验通过
  }

  function importAllData(json) {
    var err = validateImportData(json);
    if (err) return err;

    if (json.examDate) setExamDate(json.examDate);

    // 迁移导入的旧数据
    var subjects = json.subjects || [];
    for (var i = 0; i < subjects.length; i++) {
      if (!subjects[i].rounds) subjects[i].rounds = [];
      for (var j = 0; j < subjects[i].rounds.length; j++) {
        var r = subjects[i].rounds[j];
        if (r.maxDailyCapacity === undefined) r.maxDailyCapacity = 6;
        if (!r.restDays) r.restDays = [];
        if (r.minTaskEnabled === undefined) r.minTaskEnabled = false;
        if (r.minTaskAmount === undefined) r.minTaskAmount = 1;
        if (r.minTaskType === undefined) r.minTaskType = 'amount';
        if (r.minTaskMinutes === undefined) r.minTaskMinutes = 30;
        if (!r.checkins) r.checkins = [];
        if (!r.courseItems) r.courseItems = [];
      }
    }
    setItem(KEY_SUBJECTS, subjects);
    setItem(KEY_MANUAL_TASKS, json.manualTasks || []);
    setItem(KEY_MISTAKES, json.mistakes || []);
    return null;
  }

  /* ========== 4. 错题本 ========== */

  function getMistakes()    { return getItem(KEY_MISTAKES, []); }
  function saveMistakes(list){ setItem(KEY_MISTAKES, list); }

  /* ========== 暴露接口 ========== */
  return {
    uid: uid, today: today,

    getExamDate: getExamDate,
    setExamDate: setExamDate,

    getSubjects:    getSubjects,
    saveSubjects:   saveSubjects,
    findSubject:    findSubject,
    findRound:      findRound,
    addSubject:     addSubject,
    updateSubject:  updateSubject,
    deleteSubject:  deleteSubject,
    reorderSubjects: reorderSubjects,
    addRound:       addRound,
    updateRound:    updateRound,
    deleteRound:    deleteRound,
    addCheckin:     addCheckin,
    deleteCheckin:  deleteCheckin,
    updateCheckin:  updateCheckin,

    getAllCheckinDates: getAllCheckinDates,
    getStreak:          getStreak,
    getCheckinsForDate: getCheckinsForDate,

    getManualTasks:       getManualTasks,
    saveManualTasks:      saveManualTasks,
    addManualTask:        addManualTask,
    updateManualTask:     updateManualTask,
    deleteManualTask:     deleteManualTask,
    toggleManualTask:     toggleManualTask,

    getSubjectTodayCompleted: getSubjectTodayCompleted,
    getSubjectTodayPlanned:   getSubjectTodayPlanned,
    getSubjectLastCheckinDate: getSubjectLastCheckinDate,
    getSubjectStreak:         getSubjectStreak,

    addRestDay:    addRestDay,
    deleteRestDay: deleteRestDay,
    exportAllData:  exportAllData,
    importAllData:  importAllData,
    validateImportData: validateImportData,

    getMistakes:   getMistakes,
    saveMistakes:  saveMistakes
  };
})();
