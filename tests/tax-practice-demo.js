(function () {
  'use strict';

  var bankPromise = null;
  var sessions = {};
  var latestSession = null;
  var attempts = {};
  var states = {};
  var aiMessages = {};
  var nativeFetch = window.fetch.bind(window);

  function loadBank() {
    if (!bankPromise) {
      bankPromise = nativeFetch('work/tax-bank/tax-question-bank.publishable.json')
        .then(function (response) {
          if (!response.ok) throw new Error('本地演示题库未生成，请先运行解析器。');
          return response.json();
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
          return {
            id: chapter.id,
            order_no: chapter.order,
            title: chapter.title,
            question_count: chapter.questionCount
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
        return TaxPracticeLogic.calculateDashboard(chapters, stateRows);
      });
    },
    getLatestSession: function () {
      return Promise.resolve(latestSession);
    },
    createChapterSession: function (chapterId, mode) {
      return loadBank().then(function (bank) {
        var ids = bank.questions
          .filter(function (question) { return question.chapterId === chapterId; })
          .slice(0, 18)
          .map(function (question) { return question.id; });
        if (mode === 'random') ids = TaxPracticeLogic.shuffle(ids);
        return createSession(ids, chapterId, mode);
      });
    },
    createCollectionSession: function (ids, mode) {
      return Promise.resolve(createSession(ids, null, mode));
    },
    getSession: function (sessionId) {
      return Promise.resolve(sessions[sessionId]);
    },
    getQuestions: function (ids) {
      return loadBank().then(function (bank) {
        var byId = questionMap(bank);
        return ids.map(function (id) { return byId[id]; }).filter(Boolean);
      });
    },
    getAttempts: function (sessionId) {
      return Promise.resolve(Object.keys(attempts)
        .map(function (key) { return attempts[key]; })
        .filter(function (attempt) { return attempt.session_id === sessionId; }));
    },
    saveProgress: function (sessionId, index) {
      sessions[sessionId].current_index = index;
      latestSession = sessions[sessionId];
      return Promise.resolve(true);
    },
    completeSession: function (sessionId) {
      sessions[sessionId].status = 'completed';
      if (latestSession && latestSession.id === sessionId) latestSession = null;
      return Promise.resolve(true);
    },
    recordAnswer: function (sessionId, questionId, selectedAnswer) {
      return loadBank().then(function (bank) {
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
        return attempt;
      });
    },
    getQuestionState: function (questionId) {
      return Promise.resolve(stateFor(questionId));
    },
    setFavorite: function (questionId, value) {
      var state = stateFor(questionId);
      state.is_favorite = value;
      return Promise.resolve(state);
    },
    saveNote: function (questionId, note) {
      var state = stateFor(questionId);
      state.note = note.trim();
      return Promise.resolve(state);
    },
    removeFromWrongBook: function (questionId) {
      stateFor(questionId).is_in_wrong_book = false;
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

  function createSession(ids, chapterId, mode) {
    var id = makeId('session');
    var session = {
      id: id,
      chapter_id: chapterId,
      mode: mode,
      question_ids: ids,
      current_index: 0,
      status: 'active'
    };
    sessions[id] = session;
    latestSession = session;
    return session;
  }

  window.fetch = function (url, options) {
    if (url !== '/api/tax-ai') return nativeFetch(url, options);
    var body = JSON.parse(options.body);
    var messages = aiMessages[body.questionId] || [];
    messages.push({ role: 'user', content: body.message, created_at: new Date().toISOString() });
    messages.push({
      role: 'assistant',
      content: 'AI辅助解释\n\n知识点讲解\n本题应先判断税法规则的适用条件，再核对计税依据和时间点。\n\n具体例子\n把题目中的金额和日期代入规则，逐项排除不符合条件的选项。\n\n一眼看懂批注\n先看条件，再看税基，最后看时间。',
      created_at: new Date().toISOString()
    });
    aiMessages[body.questionId] = messages;
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

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      App.switchTab('tax');
      var scenario = new URLSearchParams(location.search).get('taxScenario');
      if (!scenario) return;
      setTimeout(function () {
        var chapter = document.querySelector('[data-tax-chapter]');
        if (chapter) chapter.click();
      }, 700);
      if (scenario === 'answer' || scenario === 'ai') {
        setTimeout(function () {
          var option = document.querySelector('[data-tax-option]');
          if (option) option.click();
          var submit = document.getElementById('taxSubmitBtn');
          if (submit) submit.click();
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
        }, 2300);
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
        }, 3100);
      }
    }, 20);
  });
})();
