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

  function calculateDashboard(chapters, states) {
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

    var chapterStats = [];
    var totalQuestions = 0;
    for (var j = 0; j < (chapters || []).length; j++) {
      var chapter = chapters[j];
      var stat = stateByChapter[chapter.id] || { answered: 0, correctAttempts: 0, attempts: 0 };
      var count = chapter.question_count || 0;
      totalQuestions += count;
      chapterStats.push({
        chapter: chapter,
        answered: stat.answered,
        correctRate: stat.attempts ? Math.round(stat.correctAttempts * 100 / stat.attempts) : 0,
        progressRate: count ? Math.min(100, Math.round(stat.answered * 100 / count)) : 0
      });
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
    calculateDashboard: calculateDashboard,
    formatQuestionType: formatQuestionType,
    escapeHtml: escapeHtml,
    clamp: clamp
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaxPracticeLogic;
}
