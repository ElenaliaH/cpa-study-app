/* ================================================================
   taxPracticeLogic.js - pure helpers shared by UI and tests
   ================================================================ */

var TaxPracticeLogic = (function () {
  'use strict';

  function normalizeAnswer(value) {
    var list = Array.isArray(value) ? value : [];
    var seen = {};
    var result = [];

    for (var i = 0; i < list.length; i++) {
      var item = String(list[i] || '').trim().toUpperCase();
      if (!/^[A-Z]$/.test(item) || seen[item]) continue;
      seen[item] = true;
      result.push(item);
    }
    return result.sort();
  }

  function isCorrect(selected, correct) {
    return normalizeAnswer(selected).join('') === normalizeAnswer(correct).join('');
  }

  function shuffle(values, randomFn) {
    var result = (values || []).slice();
    var random = randomFn || Math.random;
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
    return result;
  }

  function isSubjectiveType(type) {
    return ['subjective', 'calculation', 'comprehensive'].indexOf(String(type || '')) >= 0;
  }

  function calculateDashboard(chapters, states, subjectiveStates, chapterSessions) {
    var stateByChapter = {};
    var totalAnswered = 0;
    var totalCorrectAttempts = 0;
    var totalAttempts = 0;

    for (var i = 0; i < (states || []).length; i++) {
      var state = states[i] || {};
      var chapterId = state.chapter_id;
      if (!chapterId) continue;
      if (!stateByChapter[chapterId]) {
        stateByChapter[chapterId] = { answered: 0, correctAttempts: 0, attempts: 0 };
      }
      if ((state.correct_count || 0) + (state.wrong_count || 0) > 0) {
        stateByChapter[chapterId].answered++;
        totalAnswered++;
      }
      stateByChapter[chapterId].correctAttempts += state.correct_count || 0;
      stateByChapter[chapterId].attempts += (state.correct_count || 0) + (state.wrong_count || 0);
      totalCorrectAttempts += state.correct_count || 0;
      totalAttempts += (state.correct_count || 0) + (state.wrong_count || 0);
    }

    var subjectiveSeen = {};
    for (var subjectiveIndex = 0; subjectiveIndex < (subjectiveStates || []).length; subjectiveIndex++) {
      var subjectiveState = subjectiveStates[subjectiveIndex] || {};
      var subjectiveChapterId = subjectiveState.chapter_id;
      var subjectiveQuestionId = subjectiveState.question_id;
      if (!subjectiveChapterId || !subjectiveQuestionId || subjectiveSeen[subjectiveQuestionId]) continue;
      subjectiveSeen[subjectiveQuestionId] = true;
      if (!stateByChapter[subjectiveChapterId]) {
        stateByChapter[subjectiveChapterId] = { answered: 0, correctAttempts: 0, attempts: 0 };
      }
      stateByChapter[subjectiveChapterId].answered++;
      totalAnswered++;
    }

    var latestSessionByChapter = {};
    for (var sessionIndex = 0; sessionIndex < (chapterSessions || []).length; sessionIndex++) {
      var chapterSession = chapterSessions[sessionIndex] || {};
      if (!chapterSession.chapter_id || latestSessionByChapter[chapterSession.chapter_id]) continue;
      latestSessionByChapter[chapterSession.chapter_id] = chapterSession;
    }

    var chapterStats = [];
    var totalQuestions = 0;
    for (var j = 0; j < (chapters || []).length; j++) {
      var chapter = chapters[j];
      var stat = stateByChapter[chapter.id] || { answered: 0, correctAttempts: 0, attempts: 0 };
      var count = chapter.question_count || 0;
      var latestChapterSession = latestSessionByChapter[chapter.id] || null;
      var roundAnswered = latestChapterSession
        ? Math.min(count, Math.max(0, latestChapterSession.answered_count || 0))
        : stat.answered;
      totalQuestions += count;
      chapterStats.push({
        chapter: chapter,
        answered: roundAnswered,
        lifetimeAnswered: stat.answered,
        latestSession: latestChapterSession,
        correctRate: stat.attempts ? Math.round(stat.correctAttempts * 100 / stat.attempts) : 0,
        progressRate: count ? Math.min(100, Math.round(roundAnswered * 100 / count)) : 0
      });
    }

    if ((chapterSessions || []).length) {
      totalAnswered = chapterStats.reduce(function (sum, item) { return sum + item.answered; }, 0);
    }

    return {
      chapters: chapterStats,
      totalQuestions: totalQuestions,
      totalAnswered: totalAnswered,
      totalCorrectRate: totalAttempts ? Math.round(totalCorrectAttempts * 100 / totalAttempts) : 0,
      totalProgressRate: totalQuestions ? Math.min(100, Math.round(totalAnswered * 100 / totalQuestions)) : 0
    };
  }

  function formatQuestionType(type) {
    if (type === 'calculation') return '计算问答题';
    if (type === 'comprehensive') return '综合题';
    if (type === 'subjective') return '主观题';
    return String(type || '').indexOf('multiple') >= 0 ? '多选题' : '单选题';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    normalizeAnswer: normalizeAnswer,
    isCorrect: isCorrect,
    shuffle: shuffle,
    isSubjectiveType: isSubjectiveType,
    calculateDashboard: calculateDashboard,
    formatQuestionType: formatQuestionType,
    escapeHtml: escapeHtml,
    clamp: clamp
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaxPracticeLogic;
}
