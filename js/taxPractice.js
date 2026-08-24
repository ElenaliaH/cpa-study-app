/* ================================================================
   taxPractice.js - tax question-bank UI and interaction flow
   ================================================================ */

var TaxPractice = (function () {
  'use strict';

  var initialized = false;
  var activeMode = 'sequential';
  var dashboard = null;
  var latestSession = null;
  var session = null;
  var questions = [];
  var attemptsByQuestion = {};
  var currentIndex = 0;
  var selectedAnswer = [];
  var questionOpenedAt = 0;
  var currentQuestionState = null;
  var aiThreadId = null;
  var collectionKind = null;
  var collectionItems = [];
  var toastTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
  }

  function activate() {
    if (!initialized) init();
    showHome();
    loadHome();
  }

  function bindEvents() {
    var refresh = byId('taxRefreshBtn');
    if (refresh) refresh.addEventListener('click', loadHome);

    var modeControl = byId('taxModeControl');
    if (modeControl) {
      modeControl.addEventListener('click', function (event) {
        var button = event.target.closest('[data-tax-mode]');
        if (!button) return;
        activeMode = button.dataset.taxMode;
        var buttons = modeControl.querySelectorAll('[data-tax-mode]');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].classList.toggle('active', buttons[i] === button);
        }
      });
    }

    var chapterList = byId('taxChapterList');
    if (chapterList) {
      chapterList.addEventListener('click', function (event) {
        var button = event.target.closest('[data-tax-chapter]');
        if (button) startChapter(button.dataset.taxChapter);
      });
    }

    var resume = byId('taxResumeBtn');
    if (resume) {
      resume.addEventListener('click', function () {
        if (latestSession) openSession(latestSession.id);
      });
    }

    var collectionActions = document.querySelectorAll('[data-tax-collection]');
    for (var i = 0; i < collectionActions.length; i++) {
      collectionActions[i].addEventListener('click', function () {
        openCollection(this.dataset.taxCollection);
      });
    }

    byId('taxExitPracticeBtn').addEventListener('click', exitPractice);
    byId('taxOpenAnswerCardBtn').addEventListener('click', openAnswerCard);
    byId('taxCloseAnswerCardBtn').addEventListener('click', closeAnswerCard);
    byId('taxAnswerCardOverlay').addEventListener('click', function (event) {
      if (event.target === this) closeAnswerCard();
    });
    byId('taxAnswerCardGrid').addEventListener('click', function (event) {
      var button = event.target.closest('[data-tax-index]');
      if (!button) return;
      closeAnswerCard();
      moveToQuestion(Number(button.dataset.taxIndex));
    });

    byId('taxOptions').addEventListener('click', handleOptionClick);
    byId('taxSubmitBtn').addEventListener('click', submitAnswer);
    byId('taxPrevBtn').addEventListener('click', function () {
      moveToQuestion(currentIndex - 1);
    });
    byId('taxNextBtn').addEventListener('click', handleNext);
    byId('taxFavoriteBtn').addEventListener('click', toggleFavorite);
    byId('taxSaveNoteBtn').addEventListener('click', saveNote);

    byId('taxCollectionBackBtn').addEventListener('click', function () {
      showHome();
      loadHome();
    });
    byId('taxStartCollectionBtn').addEventListener('click', startCurrentCollection);
    byId('taxCollectionList').addEventListener('click', function (event) {
      var practiceButton = event.target.closest('[data-tax-practice-one]');
      if (practiceButton) {
        startCollectionIds([practiceButton.dataset.taxPracticeOne]);
        return;
      }
      var removeButton = event.target.closest('[data-tax-remove-wrong]');
      if (removeButton) {
        removeWrongQuestion(removeButton.dataset.taxRemoveWrong);
      }
    });

    var quickButtons = document.querySelectorAll('[data-tax-ai-quick]');
    for (var j = 0; j < quickButtons.length; j++) {
      quickButtons[j].addEventListener('click', function () {
        byId('taxAiInput').value = this.dataset.taxAiQuick;
        askAi();
      });
    }
    byId('taxAiSendBtn').addEventListener('click', askAi);
  }

  function showView(name) {
    var views = {
      home: byId('taxHomeView'),
      practice: byId('taxPracticeView'),
      collection: byId('taxCollectionView')
    };
    Object.keys(views).forEach(function (key) {
      views[key].style.display = key === name ? 'block' : 'none';
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showHome() {
    showView('home');
  }

  function setStatus(message, type) {
    var element = byId('taxStatus');
    if (!message) {
      element.style.display = 'none';
      element.textContent = '';
      element.className = 'tax-status';
      return;
    }
    element.textContent = message;
    element.className = 'tax-status ' + (type || 'info');
    element.style.display = 'block';
  }

  function loadHome() {
    setStatus('正在同步题库和练习进度...', 'loading');
    byId('taxChapterList').innerHTML = '<div class="tax-loading">正在加载题库...</div>';

    Promise.all([
      TaxPracticeData.loadDashboard(),
      TaxPracticeData.getLatestSession()
    ]).then(function (values) {
      dashboard = values[0];
      latestSession = values[1];
      renderDashboard();
      setStatus('', '');
    }).catch(function (error) {
      dashboard = null;
      latestSession = null;
      byId('taxChapterList').innerHTML = '';
      setStatus(error.message || '税法题库加载失败。', 'error');
    });
  }

  function renderDashboard() {
    byId('taxAnsweredMetric').textContent = dashboard.totalAnswered + ' / ' + dashboard.totalQuestions;
    byId('taxAccuracyMetric').textContent = dashboard.totalCorrectRate + '%';
    byId('taxProgressMetric').textContent = dashboard.totalProgressRate + '%';

    var chapterTitleById = {};
    var html = '';
    for (var i = 0; i < dashboard.chapters.length; i++) {
      var item = dashboard.chapters[i];
      var chapter = item.chapter;
      chapterTitleById[chapter.id] = chapter.title;
      html += '<button class="tax-chapter-row" type="button" data-tax-chapter="' +
        TaxPracticeLogic.escapeHtml(chapter.id) + '">' +
        '<span class="tax-chapter-order">' + chapter.order_no + '</span>' +
        '<span class="tax-chapter-main"><b>' + TaxPracticeLogic.escapeHtml(chapter.title) + '</b>' +
        '<small>' + item.answered + ' / ' + chapter.question_count + ' 已完成 · 正确率 ' +
        item.correctRate + '%</small>' +
        '<span class="tax-chapter-progress"><i style="width:' + item.progressRate + '%"></i></span></span>' +
        '<span class="tax-chapter-rate">' + item.progressRate + '%</span>' +
        '</button>';
    }
    byId('taxChapterList').innerHTML = html || '<div class="tax-empty">暂无已发布章节。</div>';

    var resumeButton = byId('taxResumeBtn');
    if (latestSession && latestSession.question_ids && latestSession.question_ids.length) {
      var title = latestSession.chapter_id
        ? (chapterTitleById[latestSession.chapter_id] || '章节练习')
        : collectionTitle(latestSession.mode);
      byId('taxResumeTitle').textContent = title + ' · 第 ' +
        (Math.min(latestSession.current_index + 1, latestSession.question_ids.length)) + ' 题';
      resumeButton.style.display = 'flex';
    }
    else {
      resumeButton.style.display = 'none';
    }
  }

  function startChapter(chapterId) {
    setStatus('正在创建练习...', 'loading');
    TaxPracticeData.createChapterSession(chapterId, activeMode)
      .then(function (created) {
        setStatus('', '');
        return loadSession(created);
      })
      .catch(showError);
  }

  function openSession(sessionId) {
    setStatus('正在恢复上次练习...', 'loading');
    TaxPracticeData.getSession(sessionId)
      .then(loadSession)
      .catch(showError);
  }

  function loadSession(loadedSession) {
    session = loadedSession;
    return Promise.all([
      TaxPracticeData.getQuestions(session.question_ids || []),
      TaxPracticeData.getAttempts(session.id)
    ]).then(function (values) {
      questions = values[0];
      attemptsByQuestion = {};
      for (var i = 0; i < values[1].length; i++) {
        attemptsByQuestion[values[1][i].question_id] = values[1][i];
      }
      if (!questions.length) throw new Error('当前练习没有可显示的题目。');
      currentIndex = TaxPracticeLogic.clamp(session.current_index || 0, 0, questions.length - 1);
      showView('practice');
      setStatus('', '');
      renderQuestion();
    });
  }

  function renderQuestion() {
    var question = questions[currentIndex];
    if (!question) return;

    selectedAnswer = [];
    currentQuestionState = null;
    aiThreadId = null;
    questionOpenedAt = Date.now();

    var attempt = attemptsByQuestion[question.id] || null;
    if (attempt) selectedAnswer = TaxPracticeLogic.normalizeAnswer(attempt.selected_answer);

    var title = '税法练习';
    if (dashboard && session.chapter_id) {
      for (var i = 0; i < dashboard.chapters.length; i++) {
        if (dashboard.chapters[i].chapter.id === session.chapter_id) {
          title = dashboard.chapters[i].chapter.title;
          break;
        }
      }
    }
    if (!session.chapter_id) title = collectionTitle(session.mode);

    byId('taxPracticeTitle').textContent = title;
    byId('taxPracticeProgressText').textContent = (currentIndex + 1) + ' / ' + questions.length;
    byId('taxPracticeProgressFill').style.width = Math.round((currentIndex + 1) * 100 / questions.length) + '%';
    byId('taxQuestionType').textContent =
      TaxPracticeLogic.formatQuestionType(question.question_type) +
      (question.source_label ? ' · ' + question.source_label : '');
    byId('taxQuestionStem').textContent = question.stem;

    renderOptions(question, attempt);
    byId('taxPrevBtn').disabled = currentIndex === 0;
    byId('taxNextBtn').textContent = currentIndex === questions.length - 1 ? '完成练习' : '下一题';
    byId('taxResultCard').style.display = attempt ? 'block' : 'none';
    byId('taxAiCard').style.display = attempt ? 'block' : 'none';
    byId('taxAiMessages').innerHTML = '';
    byId('taxAiInput').value = '';

    var submit = byId('taxSubmitBtn');
    submit.disabled = !selectedAnswer.length || !!attempt;
    submit.textContent = attempt ? '已提交' : '提交答案';

    if (attempt) renderResult(question, attempt);
    loadQuestionState(question.id);
    if (attempt) loadAiHistory(question.id);
  }

  function renderOptions(question, attempt) {
    var html = '';
    var selected = attempt ? TaxPracticeLogic.normalizeAnswer(attempt.selected_answer) : selectedAnswer;
    var correct = TaxPracticeLogic.normalizeAnswer(question.correct_answer);

    for (var i = 0; i < question.options.length; i++) {
      var option = question.options[i];
      var classes = ['tax-option'];
      if (selected.indexOf(option.label) >= 0) classes.push('selected');
      if (attempt && correct.indexOf(option.label) >= 0) classes.push('correct');
      if (attempt && selected.indexOf(option.label) >= 0 && correct.indexOf(option.label) < 0) classes.push('wrong');
      html += '<button class="' + classes.join(' ') + '" type="button" data-tax-option="' +
        TaxPracticeLogic.escapeHtml(option.label) + '"' + (attempt ? ' disabled' : '') + '>' +
        '<span class="tax-option-label">' + TaxPracticeLogic.escapeHtml(option.label) + '</span>' +
        '<span class="tax-option-text">' + TaxPracticeLogic.escapeHtml(option.text) + '</span>' +
        '</button>';
    }
    byId('taxOptions').innerHTML = html;
  }

  function handleOptionClick(event) {
    var button = event.target.closest('[data-tax-option]');
    if (!button) return;
    var question = questions[currentIndex];
    if (!question || attemptsByQuestion[question.id]) return;

    var label = button.dataset.taxOption;
    var isMultiple = String(question.question_type).indexOf('multiple') >= 0;
    if (isMultiple) {
      var position = selectedAnswer.indexOf(label);
      if (position >= 0) selectedAnswer.splice(position, 1);
      else selectedAnswer.push(label);
    }
    else {
      selectedAnswer = [label];
    }
    selectedAnswer = TaxPracticeLogic.normalizeAnswer(selectedAnswer);
    renderOptions(question, null);
    byId('taxSubmitBtn').disabled = !selectedAnswer.length;
  }

  function submitAnswer() {
    var question = questions[currentIndex];
    if (!question || !selectedAnswer.length || attemptsByQuestion[question.id]) return;

    var submit = byId('taxSubmitBtn');
    submit.disabled = true;
    submit.textContent = '保存中...';
    var duration = Math.round((Date.now() - questionOpenedAt) / 1000);

    TaxPracticeData.recordAnswer(session.id, question.id, selectedAnswer, duration)
      .then(function (result) {
        if (!result) throw new Error('答案保存后没有返回判题结果。');
        var attempt = {
          id: result.attempt_id,
          question_id: question.id,
          selected_answer: selectedAnswer.slice(),
          is_correct: result.is_correct
        };
        attemptsByQuestion[question.id] = attempt;
        renderOptions(question, attempt);
        renderResult(question, attempt);
        submit.textContent = '已提交';
        byId('taxResultCard').style.display = 'block';
        byId('taxAiCard').style.display = 'block';
        loadQuestionState(question.id);
        loadAiHistory(question.id);
        renderAnswerCard();
      })
      .catch(function (error) {
        submit.disabled = false;
        submit.textContent = '提交答案';
        showToast(error.message || '答案保存失败', 'error');
      });
  }

  function renderResult(question, attempt) {
    var resultTitle = byId('taxResultTitle');
    resultTitle.textContent = attempt.is_correct ? '回答正确' : '回答错误';
    resultTitle.className = 'tax-result-title ' + (attempt.is_correct ? 'correct' : 'wrong');
    byId('taxUserAnswer').textContent =
      TaxPracticeLogic.normalizeAnswer(attempt.selected_answer).join('、') || '未作答';
    byId('taxCorrectAnswer').textContent =
      TaxPracticeLogic.normalizeAnswer(question.correct_answer).join('、');
    byId('taxExplanation').textContent = question.explanation || '原文未提供解析。';
  }

  function loadQuestionState(questionId) {
    TaxPracticeData.getQuestionState(questionId).then(function (state) {
      if (!questions[currentIndex] || questions[currentIndex].id !== questionId) return;
      currentQuestionState = state || {
        question_id: questionId,
        is_favorite: false,
        note: '',
        is_in_wrong_book: false
      };
      renderQuestionState();
    }).catch(function (error) {
      showToast(error.message || '题目状态加载失败', 'error');
    });
  }

  function renderQuestionState() {
    var favorite = byId('taxFavoriteBtn');
    var isFavorite = !!(currentQuestionState && currentQuestionState.is_favorite);
    favorite.textContent = isFavorite ? '★' : '☆';
    favorite.classList.toggle('active', isFavorite);
    favorite.setAttribute('aria-label', isFavorite ? '取消收藏' : '收藏本题');
    byId('taxNoteInput').value = currentQuestionState ? (currentQuestionState.note || '') : '';
  }

  function toggleFavorite() {
    var question = questions[currentIndex];
    if (!question) return;
    var nextValue = !(currentQuestionState && currentQuestionState.is_favorite);
    TaxPracticeData.setFavorite(question.id, nextValue).then(function (state) {
      currentQuestionState = state;
      renderQuestionState();
      showToast(nextValue ? '已收藏本题' : '已取消收藏', 'success');
    }).catch(showToastError);
  }

  function saveNote() {
    var question = questions[currentIndex];
    if (!question) return;
    var note = byId('taxNoteInput').value;
    TaxPracticeData.saveNote(question.id, note).then(function (state) {
      currentQuestionState = state;
      renderQuestionState();
      showToast('笔记已保存', 'success');
    }).catch(showToastError);
  }

  function moveToQuestion(index) {
    if (!session || index < 0 || index >= questions.length || index === currentIndex) return;
    currentIndex = index;
    session.current_index = index;
    TaxPracticeData.saveProgress(session.id, index).catch(function (error) {
      showToast(error.message || '进度保存失败', 'error');
    });
    renderQuestion();
  }

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      moveToQuestion(currentIndex + 1);
      return;
    }

    TaxPracticeData.completeSession(session.id).then(function () {
      showToast('本次练习已完成', 'success');
      session = null;
      questions = [];
      attemptsByQuestion = {};
      showHome();
      loadHome();
    }).catch(showToastError);
  }

  function exitPractice() {
    if (!session) {
      showHome();
      loadHome();
      return;
    }
    TaxPracticeData.saveProgress(session.id, currentIndex).finally(function () {
      showHome();
      loadHome();
    });
  }

  function openAnswerCard() {
    renderAnswerCard();
    byId('taxAnswerCardOverlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeAnswerCard() {
    byId('taxAnswerCardOverlay').style.display = 'none';
    document.body.style.overflow = '';
  }

  function renderAnswerCard() {
    var grid = byId('taxAnswerCardGrid');
    if (!grid || !questions.length) return;
    var html = '';
    var answered = 0;
    for (var i = 0; i < questions.length; i++) {
      var attempt = attemptsByQuestion[questions[i].id];
      var classes = [];
      if (i === currentIndex) classes.push('current');
      if (attempt) {
        answered++;
        classes.push(attempt.is_correct ? 'correct' : 'wrong');
      }
      html += '<button class="' + classes.join(' ') + '" type="button" data-tax-index="' + i + '">' +
        (i + 1) + '</button>';
    }
    grid.innerHTML = html;
    byId('taxAnswerCardSummary').textContent = answered + ' / ' + questions.length + ' 已作答';
  }

  function openCollection(kind) {
    collectionKind = kind;
    collectionItems = [];
    byId('taxCollectionTitle').textContent = collectionTitle(kind);
    byId('taxCollectionCount').textContent = '正在加载...';
    byId('taxCollectionList').innerHTML = '<div class="tax-loading">正在加载...</div>';
    byId('taxStartCollectionBtn').disabled = true;
    showView('collection');

    TaxPracticeData.getCollection(kind).then(function (items) {
      collectionItems = items;
      renderCollection();
    }).catch(function (error) {
      byId('taxCollectionList').innerHTML =
        '<div class="tax-empty">' + TaxPracticeLogic.escapeHtml(error.message || '加载失败') + '</div>';
      byId('taxCollectionCount').textContent = '加载失败';
    });
  }

  function renderCollection() {
    byId('taxCollectionCount').textContent = collectionItems.length + ' 道题';
    byId('taxStartCollectionBtn').disabled = collectionItems.length === 0;
    if (!collectionItems.length) {
      byId('taxCollectionList').innerHTML = '<div class="tax-empty">这里还没有题目。</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < collectionItems.length; i++) {
      var item = collectionItems[i];
      var question = item.question;
      var note = item.state && item.state.note ? item.state.note : '';
      html += '<div class="tax-collection-row">' +
        '<div class="tax-collection-index">' + (i + 1) + '</div>' +
        '<div class="tax-collection-main"><b>' +
        TaxPracticeLogic.escapeHtml(question.stem) + '</b>' +
        (note ? '<small>笔记：' + TaxPracticeLogic.escapeHtml(note) + '</small>' : '') +
        '<span>标准答案 ' + TaxPracticeLogic.escapeHtml(
          TaxPracticeLogic.normalizeAnswer(question.correct_answer).join('、')
        ) + '</span></div>' +
        '<div class="tax-collection-actions">' +
        '<button type="button" data-tax-practice-one="' + TaxPracticeLogic.escapeHtml(question.id) + '">练习</button>' +
        (collectionKind === 'wrong'
          ? '<button type="button" data-tax-remove-wrong="' + TaxPracticeLogic.escapeHtml(question.id) + '">移出</button>'
          : '') +
        '</div></div>';
    }
    byId('taxCollectionList').innerHTML = html;
  }

  function startCurrentCollection() {
    startCollectionIds(collectionItems.map(function (item) { return item.question.id; }));
  }

  function startCollectionIds(ids) {
    setStatus('正在创建练习...', 'loading');
    TaxPracticeData.createCollectionSession(ids, collectionKind || 'wrong')
      .then(function (created) {
        setStatus('', '');
        return loadSession(created);
      })
      .catch(showError);
  }

  function removeWrongQuestion(questionId) {
    TaxPracticeData.removeFromWrongBook(questionId).then(function () {
      collectionItems = collectionItems.filter(function (item) {
        return item.question.id !== questionId;
      });
      renderCollection();
      showToast('已移出错题本', 'success');
    }).catch(showToastError);
  }

  function collectionTitle(kind) {
    if (kind === 'wrong') return '错题本';
    if (kind === 'favorite') return '我的收藏';
    if (kind === 'note') return '做题笔记';
    if (kind === 'random') return '随机练习';
    return '税法练习';
  }

  function loadAiHistory(questionId) {
    TaxPracticeData.getAiHistory(questionId).then(function (history) {
      if (!questions[currentIndex] || questions[currentIndex].id !== questionId) return;
      aiThreadId = history.threadId;
      renderAiMessages(history.messages || []);
    }).catch(function () {
      aiThreadId = null;
      renderAiMessages([]);
    });
  }

  function renderAiMessages(messages) {
    var container = byId('taxAiMessages');
    container.innerHTML = '';
    if (!messages.length) {
      var empty = document.createElement('p');
      empty.className = 'tax-ai-empty';
      empty.textContent = '可以使用快捷问题，也可以围绕本题连续追问。';
      container.appendChild(empty);
      return;
    }

    for (var i = 0; i < messages.length; i++) {
      var bubble = document.createElement('div');
      bubble.className = 'tax-ai-message ' + messages[i].role;
      var label = document.createElement('b');
      label.textContent = messages[i].role === 'assistant' ? 'AI辅助解释' : '我的问题';
      var content = document.createElement('div');
      content.textContent = messages[i].content;
      bubble.appendChild(label);
      bubble.appendChild(content);
      container.appendChild(bubble);
    }
    container.scrollTop = container.scrollHeight;
  }

  function askAi() {
    var question = questions[currentIndex];
    var attempt = question ? attemptsByQuestion[question.id] : null;
    var message = byId('taxAiInput').value.trim();
    if (!question || !attempt || !message) return;

    var button = byId('taxAiSendBtn');
    button.disabled = true;
    button.textContent = '发送中...';

    TaxPracticeData.getAccessToken()
      .then(function (token) {
        return fetch('/api/tax-ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            questionId: question.id,
            selectedAnswer: TaxPracticeLogic.normalizeAnswer(attempt.selected_answer),
            message: message,
            threadId: aiThreadId
          })
        });
      })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok) throw new Error(body.error || 'AI解释生成失败');
          return body;
        });
      })
      .then(function (body) {
        aiThreadId = body.threadId || aiThreadId;
        byId('taxAiInput').value = '';
        renderAiMessages(body.messages || []);
        if (typeof body.remaining === 'number') {
          showToast('AI解释已生成，今日剩余 ' + body.remaining + ' 次', 'success');
        }
      })
      .catch(showToastError)
      .finally(function () {
        button.disabled = false;
        button.textContent = '发送';
      });
  }

  function showError(error) {
    setStatus(error.message || '操作失败，请稍后重试。', 'error');
  }

  function showToastError(error) {
    showToast(error.message || '操作失败，请稍后重试。', 'error');
  }

  function showToast(message, type) {
    var toast = byId('taxToast');
    toast.textContent = message;
    toast.className = 'tax-toast ' + (type || 'info');
    toast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.style.display = 'none';
    }, 2600);
  }

  return {
    init: init,
    activate: activate,
    openCollection: openCollection
  };
})();
