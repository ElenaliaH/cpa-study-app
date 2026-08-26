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
        stateByChapter[chapterId] = {
          objectiveAnswered: 0,
          subjectiveAnswered: 0,
          correctAttempts: 0,
          attempts: 0
        };
      }
      if ((state.correct_count || 0) + (state.wrong_count || 0) > 0) {
        stateByChapter[chapterId].objectiveAnswered++;
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
        stateByChapter[subjectiveChapterId] = {
          objectiveAnswered: 0,
          subjectiveAnswered: 0,
          correctAttempts: 0,
          attempts: 0
        };
      }
      stateByChapter[subjectiveChapterId].subjectiveAnswered++;
      totalAnswered++;
    }

    var latestSessionByChapter = {};
    var latestSessionByScope = {};
    for (var sessionIndex = 0; sessionIndex < (chapterSessions || []).length; sessionIndex++) {
      var chapterSession = chapterSessions[sessionIndex] || {};
      if (!chapterSession.chapter_id) continue;
      if (!latestSessionByChapter[chapterSession.chapter_id]) {
        latestSessionByChapter[chapterSession.chapter_id] = chapterSession;
      }
      var scope = chapterSession.question_scope || 'objective';
      var scopeKey = chapterSession.chapter_id + ':' + scope;
      if (!latestSessionByScope[scopeKey]) latestSessionByScope[scopeKey] = chapterSession;
    }

    var chapterStats = [];
    var totalQuestions = 0;
    for (var j = 0; j < (chapters || []).length; j++) {
      var chapter = chapters[j];
      var stat = stateByChapter[chapter.id] || {
        objectiveAnswered: 0,
        subjectiveAnswered: 0,
        correctAttempts: 0,
        attempts: 0
      };
      var count = Number(chapter.question_count) || 0;
      var subjectiveCount = chapter.subjective_question_count == null
        ? stat.subjectiveAnswered
        : Number(chapter.subjective_question_count) || 0;
      var objectiveCount = chapter.objective_question_count == null
        ? Math.max(0, count - subjectiveCount)
        : Number(chapter.objective_question_count) || 0;
      if (!count) count = objectiveCount + subjectiveCount;
      var latestChapterSession = latestSessionByChapter[chapter.id] || null;
      var objectiveSession = latestSessionByScope[chapter.id + ':objective'] || null;
      var subjectiveSession = latestSessionByScope[chapter.id + ':subjective'] || null;
      var objectiveAnswered = objectiveSession
        ? Math.min(objectiveCount, Math.max(0, objectiveSession.answered_count || 0))
        : stat.objectiveAnswered;
      var subjectiveAnswered = subjectiveSession
        ? Math.min(subjectiveCount, Math.max(0, subjectiveSession.answered_count || 0))
        : stat.subjectiveAnswered;
      var roundAnswered = objectiveAnswered + subjectiveAnswered;
      totalQuestions += count;
      chapterStats.push({
        chapter: chapter,
        answered: roundAnswered,
        lifetimeAnswered: stat.objectiveAnswered + stat.subjectiveAnswered,
        latestSession: latestChapterSession,
        scopes: {
          objective: {
            count: objectiveCount,
            answered: objectiveAnswered,
            latestSession: objectiveSession
          },
          subjective: {
            count: subjectiveCount,
            answered: subjectiveAnswered,
            latestSession: subjectiveSession
          }
        },
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
