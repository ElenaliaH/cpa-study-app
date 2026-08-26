(function () {
  'use strict';

  var bankPromise = null;
  var sessions = {};
  var latestSession = null;
  var attempts = {};
  var reviews = {};
  var subjectiveAttempts = {};
  var states = {};
  var aiMessages = {};
  var nativeFetch = window.fetch.bind(window);
  var demoStateKey = 'cpa-tax-demo-state-v5';

  function clearDemoState() {
    localStorage.removeItem(demoStateKey);
  }

  function loadDemoState() {
    if (new URLSearchParams(location.search).get('taxResetDemo') === '1') clearDemoState();
    try {
      var saved = JSON.parse(localStorage.getItem(demoStateKey) || '{}');
      sessions = saved.sessions || {};
      attempts = saved.attempts || {};
      reviews = saved.reviews || {};
      subjectiveAttempts = saved.subjectiveAttempts || {};
      states = saved.states || {};
      aiMessages = saved.aiMessages || {};
      latestSession = saved.latestSessionId ? sessions[saved.latestSessionId] || null : null;
    } catch (error) {
      clearDemoState();
    }
  }

  function saveDemoState() {
    localStorage.setItem(demoStateKey, JSON.stringify({
      sessions: sessions,
      attempts: attempts,
      reviews: reviews,
      subjectiveAttempts: subjectiveAttempts,
      states: states,
      aiMessages: aiMessages,
      latestSessionId: latestSession ? latestSession.id : null
    }));
  }

  loadDemoState();

  function loadBank() {
    if (!bankPromise) {
      bankPromise = Promise.all([
        nativeFetch('work/tax-bank/tax-question-bank.publishable.json?v=20260827a'),
        nativeFetch('work/tax-bank/tax-subjective-bank.publishable.json?v=20260827a')
      ]).then(function (responses) {
        if (!responses[0].ok || !responses[1].ok) {
          throw new Error('本地演示题库未生成，请先运行解析器。');
        }
        return Promise.all([responses[0].json(), responses[1].json()]);
      }).then(function (banks) {
        var bank = banks[0];
        var subjectiveBank = banks[1];
        bank.questions = bank.questions.concat(subjectiveBank.questions);
        bank.chapters = bank.chapters.map(function (chapter) {
          var subjectiveChapter = subjectiveBank.chapters.find(function (item) {
            return item.id === chapter.id;
          });
          chapter.subjectiveQuestionCount = subjectiveChapter
            ? subjectiveChapter.subjectiveQuestionCount
            : 0;
          chapter.questionCount += chapter.subjectiveQuestionCount;
          return chapter;
        });
        return bank;
      });
    }
    return bankPromise;
  }

  function makeId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function questionMap(bank) {
    var result = {};
    bank.questions.forEach(function (question) { result[question.id] = question; });
    return result;
  }

  function normalizeDemoQuestion(question) {
    return {
      id: question.id,
      chapter_id: question.chapterId,
      sequence_no: question.sequenceNo,
      question_type: question.questionType,
      source_label: question.sourceLabel || '',
      stem: question.stem,
      options: question.options || [],
      correct_answer: question.correctAnswer || [],
      answer_raw: question.answerRaw || '',
      explanation: question.explanation || ''
    };
  }

  function stateFor(questionId) {
    if (!states[questionId]) {
      states[questionId] = {
        question_id: questionId,
        is_favorite: false,
        note: '',
        is_in_wrong_book: false,
        wrong_count: 0,
        correct_count: 0,
        last_is_correct: null
      };
    }
    return states[questionId];
  }

  SupabaseStorage.refreshSession = function (callback) { callback(); };
  SupabaseStorage.isLoggedIn = function () { return true; };
  SupabaseStorage.getCurrentUser = function () { return { id: 'demo-user' }; };
  SupabaseStorage.loadAppData = function (callback) {
    callback(SupabaseStorage.loadLocalData() || SupabaseStorage.buildDataFromStore());
  };

  TaxPracticeData = {
    loadDashboard: function () {
      return loadBank().then(function (bank) {
        var chapters = bank.chapters.map(function (chapter) {
          var chapterQuestions = bank.questions.filter(function (question) {
            return question.chapterId === chapter.id;
          });
          var subjectiveCount = chapterQuestions.filter(function (question) {
            return ['subjective', 'calculation', 'comprehensive'].indexOf(question.questionType) >= 0;
          }).length;
          return {
            id: chapter.id,
            order_no: chapter.order,
            title: chapter.title,
            question_count: chapterQuestions.length,
            objective_question_count: chapterQuestions.length - subjectiveCount,
            subjective_question_count: subjectiveCount
          };
        });
        var byId = questionMap(bank);
        var stateRows = Object.keys(states).map(function (id) {
          var state = states[id];
          return {
            chapter_id: byId[id] ? byId[id].chapterId : null,
            correct_count: state.correct_count,
            wrong_count: state.wrong_count
          };
        });
        var subjectiveRows = Object.keys(reviews).map(function (key) {
          var review = reviews[key];
          return {
            question_id: review.question_id,
            chapter_id: byId[review.question_id] ? byId[review.question_id].chapterId : null
          };
        });
        var chapterSessions = Object.keys(sessions)
          .map(function (id) { return sessions[id]; })
          .filter(function (item) { return !!item.chapter_id; })
          .sort(function (a, b) { return String(b.last_active_at).localeCompare(String(a.last_active_at)); });
        return TaxPracticeLogic.calculateDashboard(chapters, stateRows, subjectiveRows, chapterSessions);
      });
    },
    getLatestSession: function () {
      return Promise.resolve(latestSession);
    },
    getLatestChapterSession: function (chapterId, scope) {
      var matches = Object.keys(sessions)
        .map(function (id) { return sessions[id]; })
        .filter(function (item) {
          return item.chapter_id === chapterId && (item.question_scope || 'objective') === scope;
        })
        .sort(function (a, b) { return String(b.last_active_at).localeCompare(String(a.last_active_at)); });
      return Promise.resolve(matches[0] || null);
    },
    createChapterSession: function (chapterId, mode, scope) {
      return loadBank().then(function (bank) {
        var ids = bank.questions
          .filter(function (question) {
            var subjective = ['subjective', 'calculation', 'comprehensive']
              .indexOf(question.questionType) >= 0;
            return question.chapterId === chapterId &&
              (scope === 'subjective' ? subjective : !subjective);
          })
          .map(function (question) { return question.id; });
        if (mode === 'random') ids = TaxPracticeLogic.shuffle(ids);
        return createSession(ids, chapterId, mode, scope);
      });
    },
    resetChapterSession: function (chapterId, mode, scope) {
      Object.keys(sessions).forEach(function (id) {
        if (sessions[id].chapter_id === chapterId &&
            (sessions[id].question_scope || 'objective') === scope &&
            sessions[id].status === 'active') {
          sessions[id].status = 'completed';
        }
      });
      return this.createChapterSession(chapterId, mode, scope);
    },
    createCollectionSession: function (ids, mode) {
      return Promise.resolve(createSession(ids, null, mode, 'mixed'));
    },
    getSession: function (sessionId) {
      return Promise.resolve(sessions[sessionId]);
    },
    getQuestions: function (ids) {
      return loadBank().then(function (bank) {
        var byId = questionMap(bank);
        return ids.map(function (id) { return byId[id]; })
          .filter(Boolean)
          .map(normalizeDemoQuestion);
      });
    },
    getAttempts: function (sessionId) {
      return Promise.resolve(Object.keys(attempts)
        .map(function (key) { return attempts[key]; })
        .filter(function (attempt) { return attempt.session_id === sessionId; }));
    },
    getSubjectiveReviews: function (sessionId) {
      return Promise.resolve(Object.keys(reviews)
        .map(function (key) { return reviews[key]; })
        .filter(function (review) { return review.session_id === sessionId; }));
    },
    getSubjectiveAttempts: function (sessionId) {
      return Promise.resolve(Object.keys(subjectiveAttempts)
        .map(function (key) { return subjectiveAttempts[key]; })
        .filter(function (attempt) { return attempt.session_id === sessionId; }));
    },
    saveSubjectiveAnswer: function (sessionId, questionId, answerText) {
      var key = sessionId + ':' + questionId;
      subjectiveAttempts[key] = {
        id: subjectiveAttempts[key] ? subjectiveAttempts[key].id : makeId('subjective-attempt'),
        session_id: sessionId,
        question_id: questionId,
        answer_text: answerText,
        status: 'submitted',
        ai_score: null,
        ai_feedback: null,
        ai_model: null,
        submitted_at: new Date().toISOString(),
        graded_at: null
      };
      saveDemoState();
      return Promise.resolve(subjectiveAttempts[key]);
    },
    saveProgress: function (sessionId, index) {
      sessions[sessionId].current_index = index;
      sessions[sessionId].last_active_at = new Date().toISOString();
      latestSession = sessions[sessionId];
      saveDemoState();
      return Promise.resolve(true);
    },
    updateSessionQuestions: function (sessionId, questionIds, index, answeredCount, correctCount) {
      sessions[sessionId].question_ids = questionIds.slice();
      sessions[sessionId].current_index = questionIds.length
        ? Math.min(Math.max(0, index), questionIds.length - 1)
        : 0;
      sessions[sessionId].answered_count = Math.max(0, answeredCount || 0);
      sessions[sessionId].correct_count = Math.max(0, correctCount || 0);
      sessions[sessionId].last_active_at = new Date().toISOString();
      latestSession = sessions[sessionId];
      saveDemoState();
      return Promise.resolve(true);
    },
    completeSession: function (sessionId) {
      sessions[sessionId].status = 'completed';
      sessions[sessionId].last_active_at = new Date().toISOString();
      if (latestSession && latestSession.id === sessionId) latestSession = null;
      saveDemoState();
      return Promise.resolve(true);
    },
    recordAnswer: function (sessionId, questionId, selectedAnswer) {
      return loadBank().then(function (bank) {
        var existing = attempts[sessionId + ':' + questionId];
        if (existing) return existing;
        var question = questionMap(bank)[questionId];
        var correct = TaxPracticeLogic.isCorrect(selectedAnswer, question.correctAnswer);
        var attempt = {
          attempt_id: makeId('attempt'),
          id: makeId('attempt'),
          session_id: sessionId,
          question_id: questionId,
          selected_answer: selectedAnswer,
          is_correct: correct,
          correct_answer: question.correctAnswer
        };
        attempts[sessionId + ':' + questionId] = attempt;
        var state = stateFor(questionId);
        state.last_is_correct = correct;
        if (correct) state.correct_count++;
        else {
          state.wrong_count++;
          state.is_in_wrong_book = true;
        }
        refreshDemoSessionCounts(sessionId);
        return attempt;
      });
    },
    recordSubjectiveReview: function (sessionId, questionId) {
      var key = sessionId + ':' + questionId;
      if (!reviews[key]) {
        reviews[key] = {
          review_id: makeId('review'),
          id: makeId('review'),
          session_id: sessionId,
          question_id: questionId,
          viewed_at: new Date().toISOString()
        };
      }
      refreshDemoSessionCounts(sessionId);
      return Promise.resolve(reviews[key]);
    },
    refreshSessionCounts: function (sessionId) {
      refreshDemoSessionCounts(sessionId);
      return Promise.resolve({
        answered_count: sessions[sessionId].answered_count,
        correct_count: sessions[sessionId].correct_count
      });
    },
    getQuestionState: function (questionId) {
      return Promise.resolve(stateFor(questionId));
    },
    setFavorite: function (questionId, value) {
      var state = stateFor(questionId);
      state.is_favorite = value;
      saveDemoState();
      return Promise.resolve(state);
    },
    saveNote: function (questionId, note) {
      var state = stateFor(questionId);
      state.note = note.trim();
      saveDemoState();
      return Promise.resolve(state);
    },
    removeFromWrongBook: function (questionId) {
      stateFor(questionId).is_in_wrong_book = false;
      saveDemoState();
      return Promise.resolve(stateFor(questionId));
    },
    getCollection: function (kind) {
      return loadBank().then(function (bank) {
        var byId = questionMap(bank);
        return Object.keys(states).filter(function (id) {
          var state = states[id];
          if (kind === 'wrong') return state.is_in_wrong_book;
          if (kind === 'favorite') return state.is_favorite;
          return !!state.note;
        }).map(function (id) {
          return { question: byId[id], state: states[id] };
        }).filter(function (item) { return !!item.question; });
      });
    },
    getAiHistory: function (questionId) {
      return Promise.resolve({
        threadId: aiMessages[questionId] ? 'demo-thread-' + questionId : null,
        messages: aiMessages[questionId] || []
      });
    },
    getAccessToken: function () {
      return Promise.resolve('demo-token');
    }
  };

  function createSession(ids, chapterId, mode, scope) {
    var id = makeId('session');
    var session = {
      id: id,
      chapter_id: chapterId,
      mode: mode,
      question_scope: scope,
      question_ids: ids,
      current_index: 0,
      answered_count: 0,
      correct_count: 0,
      status: 'active',
      last_active_at: new Date().toISOString()
    };
    sessions[id] = session;
    latestSession = session;
    saveDemoState();
    return session;
  }

  function refreshDemoSessionCounts(sessionId) {
    var session = sessions[sessionId];
    if (!session) return;
    var sessionAttempts = Object.keys(attempts)
      .map(function (key) { return attempts[key]; })
      .filter(function (attempt) { return attempt.session_id === sessionId; });
    var sessionReviews = Object.keys(reviews)
      .map(function (key) { return reviews[key]; })
      .filter(function (review) { return review.session_id === sessionId; });
    session.answered_count = sessionAttempts.length + sessionReviews.length;
    session.correct_count = sessionAttempts.filter(function (attempt) { return attempt.is_correct; }).length;
    session.last_active_at = new Date().toISOString();
    saveDemoState();
  }

  window.fetch = function (url, options) {
    if (url !== '/api/tax-ai') return nativeFetch(url, options);
    var body = JSON.parse(options.body);
    if (body.action === 'grade') {
      var attemptKey = body.sessionId + ':' + body.questionId;
      var gradedAttempt = {
        id: subjectiveAttempts[attemptKey]
          ? subjectiveAttempts[attemptKey].id
          : makeId('subjective-attempt'),
        session_id: body.sessionId,
        question_id: body.questionId,
        answer_text: body.answerText,
        status: 'graded',
        ai_score: 82,
        ai_feedback: {
          summary: '核心判断顺序基本完整，计税依据和时间点还可以写得更明确。',
          strengths: ['先判断纳税主体和交易性质', '提到了计税依据和适用税率'],
          omissions: ['未单独说明纳税义务发生时间'],
          corrections: ['可抵扣项目应结合合法凭证和用途判断'],
          suggestions: ['按主体、行为、时间、税基、税率、抵扣、税额的顺序作答'],
          referenceApproach: '先定主体和应税行为，再定时间与税基，最后计算税额并复核抵扣条件。'
        },
        ai_model: 'demo-gpt',
        submitted_at: new Date().toISOString(),
        graded_at: new Date().toISOString()
      };
      subjectiveAttempts[attemptKey] = gradedAttempt;
      var reviewKey = body.sessionId + ':' + body.questionId;
      if (!reviews[reviewKey]) {
        reviews[reviewKey] = {
          id: makeId('review'),
          session_id: body.sessionId,
          question_id: body.questionId,
          viewed_at: new Date().toISOString()
        };
      }
      refreshDemoSessionCounts(body.sessionId);
      saveDemoState();
      return Promise.resolve(new Response(JSON.stringify({
        attempt: gradedAttempt,
        review: reviews[reviewKey],
        remaining: 19,
        model: 'demo-gpt'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    var messages = aiMessages[body.questionId] || [];
    messages.push({ role: 'user', content: body.message, created_at: new Date().toISOString() });
    messages.push({
      role: 'assistant',
      content: 'AI辅助解释\n\n知识点讲解\n本题应先判断税法规则的适用条件，再核对计税依据和时间点。\n\n具体例子\n把题目中的金额和日期代入规则，逐项排除不符合条件的选项。\n\n一眼看懂批注\n先看条件，再看税基，最后看时间。',
      created_at: new Date().toISOString()
    });
    aiMessages[body.questionId] = messages;
    saveDemoState();
    return Promise.resolve(new Response(JSON.stringify({
      threadId: 'demo-thread-' + body.questionId,
      messages: messages,
      remaining: 19,
      model: 'demo'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  };

  function completeDemoSample(done) {
    var index = 0;
    function answerNext() {
      var reveal = document.getElementById('taxRevealSubjectiveBtn');
      var subjectiveVisible = document.getElementById('taxSubjectiveAction').style.display !== 'none';
      if (subjectiveVisible && reveal && !reveal.disabled) reveal.click();
      else {
        var option = document.querySelector('[data-tax-option]');
        if (option) option.click();
        document.getElementById('taxSubmitBtn').click();
      }
      setTimeout(function () {
        index++;
        if (index < 5) {
          document.getElementById('taxNextBtn').click();
          setTimeout(answerNext, 100);
          return;
        }
        if (done) done();
      }, 120);
    }
    answerNext();
  }

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      App.switchTab('tax');
      var scenario = new URLSearchParams(location.search).get('taxScenario');
      if (!scenario) return;
      if (scenario === 'resume') {
        setTimeout(function () {
          var resume = document.getElementById('taxResumeBtn');
          if (resume && resume.style.display !== 'none') resume.click();
        }, 700);
        return;
      }
      if (scenario === 'reset') {
        setTimeout(function () {
          var reset = document.querySelector('[data-tax-reset-chapter]');
          if (reset) reset.click();
        }, 700);
        setTimeout(function () {
          var confirm = document.getElementById('modalConfirm');
          if (confirm) confirm.click();
        }, 900);
        return;
      }
      if (scenario === 'subjective') {
        var subjectiveScope = document.querySelector('[data-tax-scope="subjective"]');
        if (subjectiveScope) subjectiveScope.click();
      }
      setTimeout(function () {
        var chapter = document.querySelector('[data-tax-chapter]');
        if (chapter) chapter.click();
      }, 700);
      if (scenario === 'progress') {
        setTimeout(function () {
          var firstOption = document.querySelector('[data-tax-option]');
          if (firstOption) firstOption.click();
          document.getElementById('taxSubmitBtn').click();
          setTimeout(function () {
            document.getElementById('taxNextBtn').click();
            var secondOption = document.querySelector('[data-tax-option]');
            if (secondOption) secondOption.click();
            document.getElementById('taxSubmitBtn').click();
          }, 180);
        }, 1500);
      }
      if (scenario === 'answer' || scenario === 'ai') {
        setTimeout(function () {
          completeDemoSample();
        }, 1500);
      }
      if (scenario === 'card') {
        setTimeout(function () {
          var answerCard = document.getElementById('taxOpenAnswerCardBtn');
          if (answerCard) answerCard.click();
        }, 1500);
      }
      if (scenario === 'ai') {
        setTimeout(function () {
          var quick = document.querySelector('[data-tax-ai-quick]');
          if (quick) quick.click();
        }, 2700);
        setTimeout(function () {
          var aiCard = document.getElementById('taxAiCard');
          var pageHeader = document.querySelector('.tax-page-header');
          var toolbar = document.querySelector('.tax-practice-toolbar');
          var progress = document.querySelector('.tax-progress-track');
          var questionCard = document.querySelector('.tax-question-card');
          var resultCard = document.getElementById('taxResultCard');
          if (pageHeader) pageHeader.style.display = 'none';
          if (toolbar) toolbar.style.display = 'none';
          if (progress) progress.style.display = 'none';
          if (questionCard) questionCard.style.display = 'none';
          if (resultCard) resultCard.style.display = 'none';
          if (aiCard) aiCard.style.display = 'block';
          window.scrollTo(0, 0);
        }, 3500);
      }
      if (scenario === 'subjective') {
        setTimeout(function () {
          var answer = document.getElementById('taxSubjectiveAnswerInput');
          if (answer) {
            answer.value = '应先判断纳税主体和交易性质，再确认纳税义务发生时间、计税依据、适用税率、抵扣条件并计算应纳税额。';
            answer.dispatchEvent(new Event('input', { bubbles: true }));
          }
          var grade = document.getElementById('taxGradeSubjectiveBtn');
          if (grade) grade.click();
        }, 1500);
      }
    }, 20);
  });
})();
