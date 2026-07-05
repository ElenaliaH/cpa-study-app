/* ================================================================
   progress.js — 进度计算工具（纯函数，不操作 DOM 和 localStorage）
   所有计算基于轮次数据，每次调用时动态运算，不存储死数据
   ================================================================ */

var Progress = (function () {
  'use strict';

  /* ---- 1. 已完成工作量 = 该轮次所有打卡 amount 合计 ---- */
  function getCompletedWork(round) {
    if (!round || !round.checkins || round.checkins.length === 0) return 0;
    var sum = 0;
    for (var i = 0; i < round.checkins.length; i++) {
      sum += (round.checkins[i].amount || 0);
    }
    return sum;
  }

  /* ---- 2. 剩余工作量 ---- */
  function getRemainingWork(round) {
    var total = round.totalWork || 0;
    return Math.max(0, total - getCompletedWork(round));
  }

  /* ---- 3. 剩余天数（含今天）---- */
  function getRemainingDays(deadline) {
    if (!deadline) return 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var dl = new Date(deadline + 'T00:00:00');
    var diff = dl.getTime() - today.getTime();
    var days = Math.ceil(diff / 86400000) + 1; // 含今天
    return Math.max(0, days);
  }

  /* ---- 3b. 剩余学习日（排除休息日）---- */
  function getRemainingStudyDays(deadline, restDays) {
    var totalDays = getRemainingDays(deadline);
    if (totalDays <= 0) return 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var restSet = {};
    if (restDays) {
      for (var i = 0; i < restDays.length; i++) { restSet[restDays[i]] = true; }
    }
    var studyDays = 0;
    for (var d = 0; d < totalDays; d++) {
      var check = new Date(today.getTime() + d * 86400000);
      var ds = check.getFullYear() + '-' +
        String(check.getMonth() + 1).padStart(2, '0') + '-' +
        String(check.getDate()).padStart(2, '0');
      if (!restSet[ds]) studyDays++;
    }
    return studyDays;
  }

  /** 今天是不是休息日 */
  function isRestDayToday(round) {
    var today = getDateStr();
    var restDays = round.restDays || [];
    return restDays.indexOf(today) !== -1;
  }

  /* ---- 4. 今日计划完成量（用学习日计算）---- */
  function getDailyPlan(round) {
    var completed = getCompletedWork(round);
    var total     = round.totalWork || 0;
    if (completed >= total) return 0;
    if (isRestDayToday(round)) return 0;

    var remaining = total - completed;
    var days      = getRemainingStudyDays(round.deadline, round.restDays);
    if (days <= 0) return remaining;
    return Math.ceil(remaining / days);
  }

  /* ---- 5. 进度状态判定 ---- */
  function getProgressStatus(round) {
    var completed = getCompletedWork(round);
    var total     = round.totalWork || 0;

    // 没有设置工作量，无法判定
    if (total === 0) return { key: 'no-data', label: '未设置工作量', cls: 'status-neutral' };

    // 已完成
    if (completed >= total) return { key: 'done', label: '已完成', cls: 'status-done' };

    var days      = getRemainingDays(round.deadline);
    var dailyPlan = getDailyPlan(round);
    var remaining = total - completed;

    // 已逾期
    if (days <= 0 && completed < total) {
      return { key: 'overdue', label: '已逾期', cls: 'status-overdue' };
    }

    // 初始平均每日计划 = total / totalDays（从创建到截止的总天数）
    var todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    var dlDate = round.deadline ? new Date(round.deadline + 'T00:00:00') : todayDate;

    // 计算从今天到 deadline 的天数（含今天）
    var totalDaysFromNow = Math.ceil((dlDate.getTime() - todayDate.getTime()) / 86400000) + 1;
    if (totalDaysFromNow <= 0) totalDaysFromNow = 1;

    // 理想进度 = total / totalDays（最初每天的均匀计划）
    // 使用最大可能的天数来算初始平均
    var initialAvg = 0;
    if (round.createdAt) {
      var startDate = new Date(round.createdAt);
      startDate.setHours(0, 0, 0, 0);
      var totalDays = Math.ceil((dlDate.getTime() - startDate.getTime()) / 86400000) + 1;
      if (totalDays > 0) initialAvg = Math.ceil(total / totalDays);
    }
    if (initialAvg <= 0) initialAvg = Math.ceil(total / Math.max(1, totalDaysFromNow));

    // 应该完成的工作量 = 已过天数 × 初始平均
    var elapsedDays = 0;
    if (round.createdAt) {
      var st = new Date(round.createdAt);
      st.setHours(0, 0, 0, 0);
      elapsedDays = Math.max(0, Math.ceil((todayDate.getTime() - st.getTime()) / 86400000));
    }
    var expectedWork = elapsedDays * initialAvg;

    // 进度落后：今日计划明显高于初始平均（1.5 倍以上）
    if (dailyPlan > initialAvg * 1.5) {
      return { key: 'behind', label: '进度落后', cls: 'status-behind' };
    }

    // 进度超前：已完成超过预期进度
    if (completed > expectedWork && expectedWork > 0 && remaining > 0) {
      return { key: 'ahead', label: '进度超前', cls: 'status-ahead' };
    }

    // 进度正常
    return { key: 'normal', label: '进度正常', cls: 'status-normal' };
  }

  /* ---- 6. 今日该轮次的打卡总量 ---- */
  function getTodayCheckinTotal(round) {
    var today = getDateStr();
    var sum = 0;
    var checks = round.checkins || [];
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].date === today) sum += (checks[i].amount || 0);
    }
    return sum;
  }

  /* ---- 7. 进度预警 ---- */
  function getProgressWarning(round) {
    var completed = getCompletedWork(round);
    var total     = round.totalWork || 0;
    if (total === 0) return { level: 'normal', msg: '未设置工作量' };
    if (completed >= total) return { level: 'done', msg: '已完成，无需预警' };

    var days = getRemainingStudyDays(round.deadline, round.restDays);
    if (getRemainingDays(round.deadline) <= 0 && completed < total) {
      return { level: 'overdue', msg: '已逾期' };
    }
    if (isRestDayToday(round)) return { level: 'rest', msg: '今日休息' };

    var dailyPlan  = getDailyPlan(round);
    var maxCap     = round.maxDailyCapacity || 6;

    // 初始平均：从轮次创建起算
    var initialAvg = 0;
    if (round.createdAt) {
      var start = new Date(round.createdAt);
      start.setHours(0,0,0,0);
      var dl = round.deadline ? new Date(round.deadline + 'T00:00:00') : new Date();
      var totalDays = Math.ceil((dl.getTime() - start.getTime()) / 86400000) + 1;
      if (totalDays > 0) initialAvg = Math.ceil(total / totalDays);
    }
    if (initialAvg <= 0) initialAvg = Math.ceil(total / Math.max(1, days || 1));

    if (dailyPlan > maxCap) return { level: 'danger', msg: '高风险：每日需要 ' + dailyPlan + '，超过可承受上限 ' + maxCap };
    if (dailyPlan >= initialAvg * 1.5) return { level: 'behind', msg: '明显落后：当前每日计划是初始的 ' + Math.round(dailyPlan / initialAvg * 10) / 10 + ' 倍' };
    if (dailyPlan >= initialAvg * 1.2) return { level: 'slight', msg: '轻微落后：每日计划略高于初始平均' };
    return { level: 'normal', msg: '进度正常' };
  }

  /* ---- 8. 最低保底状态 ---- */
  function getMinTaskStatus(round) {
    if (!round.minTaskEnabled) return null;
    var todayTotal = getTodayCheckinTotal(round);
    var dailyPlan  = getDailyPlan(round);
    var minAmount  = round.minTaskAmount || 1;

    if (dailyPlan <= 0 && isRestDayToday(round)) {
      return { key: 'rest', msg: '今日休息', cls: 'min-rest' };
    }
    if (todayTotal >= dailyPlan && dailyPlan > 0) {
      return { key: 'full', msg: '今日计划完成 ✓', cls: 'min-full' };
    }
    if (todayTotal >= minAmount) {
      return { key: 'min-only', msg: '保底完成，计划未完成', cls: 'min-ok' };
    }
    return { key: 'none', msg: '尚未完成保底（≥' + minAmount + '）', cls: 'min-fail' };
  }

  /* ---- 9. 某个科目是否今天有打卡（用于首页） ---- */
  function hasCheckedInToday(subject) {
    if (!subject || !subject.rounds) return false;
    var today = getDateStr();
    for (var i = 0; i < subject.rounds.length; i++) {
      var checks = subject.rounds[i].checkins || [];
      for (var j = 0; j < checks.length; j++) {
        if (checks[j].date === today) return true;
      }
    }
    return false;
  }

  /* ---- 工具：今天的日期字符串 ---- */
  function getDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  return {
    getCompletedWork:     getCompletedWork,
    getRemainingWork:     getRemainingWork,
    getRemainingDays:     getRemainingDays,
    getRemainingStudyDays: getRemainingStudyDays,
    isRestDayToday:       isRestDayToday,
    getDailyPlan:         getDailyPlan,
    getProgressStatus:    getProgressStatus,
    getTodayCheckinTotal: getTodayCheckinTotal,
    getProgressWarning:   getProgressWarning,
    getMinTaskStatus:     getMinTaskStatus,
    hasCheckedInToday:    hasCheckedInToday
  };
})();
