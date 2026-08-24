/* ================================================================
   taxPracticeData.js - Supabase data access for tax practice
   ================================================================ */

var TaxPracticeData = (function () {
  'use strict';

  function getUser() {
    var user = SupabaseStorage.getCurrentUser();
    if (!user) throw new Error('请先登录后再使用税法刷题。');
    return user;
  }

  function unwrap(result, fallbackMessage) {
    if (result.error) {
      var message = result.error.message || fallbackMessage || '数据请求失败';
      if (/relation .* does not exist|schema cache/i.test(message)) {
        throw new Error('税法题库数据库尚未初始化，请先执行迁移并导入题库。');
      }
      throw new Error(message);
    }
    return result.data;
  }

  function listChapters() {
    getUser();
    return supabaseClient
      .from('tax_chapters')
      .select('id,order_no,title,question_count')
      .eq('is_published', true)
      .order('order_no')
      .then(function (result) {
        return unwrap(result, '章节加载失败') || [];
      });
  }

  function listUserStates() {
    var user = getUser();
    return supabaseClient
      .from('tax_question_user_state')
      .select('question_id,correct_count,wrong_count,is_favorite,is_in_wrong_book,note,tax_questions(chapter_id)')
      .eq('user_id', user.id)
      .then(function (result) {
        var rows = unwrap(result, '练习统计加载失败') || [];
        return rows.map(function (row) {
          row.chapter_id = row.tax_questions ? row.tax_questions.chapter_id : null;
          delete row.tax_questions;
          return row;
        });
      });
  }

  function loadDashboard() {
    return Promise.all([listChapters(), listUserStates()]).then(function (values) {
      return TaxPracticeLogic.calculateDashboard(values[0], values[1]);
    });
  }

  function getLatestSession() {
    var user = getUser();
    return supabaseClient
      .from('tax_practice_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('last_active_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(function (result) {
        return unwrap(result, '上次练习加载失败');
      });
  }

  function getQuestionIdsForChapter(chapterId) {
    getUser();
    return supabaseClient
      .from('tax_questions')
      .select('id,sequence_no')
      .eq('chapter_id', chapterId)
      .eq('is_published', true)
      .order('sequence_no')
      .then(function (result) {
        return (unwrap(result, '题目列表加载失败') || []).map(function (row) { return row.id; });
      });
  }

  function insertSession(questionIds, chapterId, mode) {
    var user = getUser();
    return supabaseClient
      .from('tax_practice_sessions')
      .insert({
        user_id: user.id,
        chapter_id: chapterId || null,
        mode: mode,
        question_ids: questionIds,
        current_index: 0,
        status: 'active'
      })
      .select()
      .single()
      .then(function (result) {
        return unwrap(result, '练习创建失败');
      });
  }

  function createChapterSession(chapterId, mode) {
    return getQuestionIdsForChapter(chapterId).then(function (questionIds) {
      if (!questionIds.length) throw new Error('这个章节暂时没有可练习题目。');
      if (mode === 'random') questionIds = TaxPracticeLogic.shuffle(questionIds);
      return insertSession(questionIds, chapterId, mode);
    });
  }

  function createCollectionSession(questionIds, mode) {
    var ids = (questionIds || []).slice(0, 200);
    if (!ids.length) throw new Error('当前列表没有可练习题目。');
    if (mode !== 'note') ids = TaxPracticeLogic.shuffle(ids);
    return insertSession(ids, null, mode);
  }

  function getSession(sessionId) {
    var user = getUser();
    return supabaseClient
      .from('tax_practice_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()
      .then(function (result) {
        return unwrap(result, '练习会话加载失败');
      });
  }

  function getQuestions(questionIds) {
    getUser();
    if (!questionIds || !questionIds.length) return Promise.resolve([]);
    return supabaseClient
      .from('tax_questions')
      .select('id,chapter_id,sequence_no,question_type,source_label,stem,options,correct_answer,answer_raw,explanation')
      .in('id', questionIds)
      .eq('is_published', true)
      .then(function (result) {
        var rows = unwrap(result, '题目加载失败') || [];
        var byId = {};
        for (var i = 0; i < rows.length; i++) byId[rows[i].id] = rows[i];
        return questionIds.map(function (id) { return byId[id]; }).filter(Boolean);
      });
  }

  function getAttempts(sessionId) {
    var user = getUser();
    return supabaseClient
      .from('tax_question_attempts')
      .select('id,question_id,selected_answer,is_correct,answered_at')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .then(function (result) {
        return unwrap(result, '答题记录加载失败') || [];
      });
  }

  function saveProgress(sessionId, index) {
    var user = getUser();
    return supabaseClient
      .from('tax_practice_sessions')
      .update({ current_index: Math.max(0, index), last_active_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .then(function (result) {
        unwrap(result, '练习进度保存失败');
        return true;
      });
  }

  function completeSession(sessionId) {
    var user = getUser();
    return supabaseClient
      .from('tax_practice_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        last_active_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .then(function (result) {
        unwrap(result, '练习结束状态保存失败');
        return true;
      });
  }

  function recordAnswer(sessionId, questionId, selectedAnswer, durationSeconds) {
    getUser();
    return supabaseClient
      .rpc('record_tax_answer', {
        p_session_id: sessionId,
        p_question_id: questionId,
        p_selected_answer: TaxPracticeLogic.normalizeAnswer(selectedAnswer),
        p_duration_seconds: Math.max(0, Math.round(durationSeconds || 0))
      })
      .then(function (result) {
        var rows = unwrap(result, '答案保存失败') || [];
        return rows[0] || null;
      });
  }

  function getQuestionState(questionId) {
    var user = getUser();
    return supabaseClient
      .from('tax_question_user_state')
      .select('*')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .maybeSingle()
      .then(function (result) {
        return unwrap(result, '题目状态加载失败');
      });
  }

  function updateQuestionPreferences(questionId, favorite, note, clearWrong) {
    getUser();
    return supabaseClient
      .rpc('update_tax_question_preferences', {
        p_question_id: questionId,
        p_is_favorite: favorite,
        p_note: note,
        p_clear_wrong: !!clearWrong
      })
      .then(function (result) {
        var rows = unwrap(result, '题目状态保存失败') || [];
        return rows[0] || null;
      });
  }

  function setFavorite(questionId, value) {
    return updateQuestionPreferences(questionId, !!value, null, false);
  }

  function saveNote(questionId, note) {
    return updateQuestionPreferences(
      questionId,
      null,
      String(note || '').trim().slice(0, 4000),
      false
    );
  }

  function removeFromWrongBook(questionId) {
    return updateQuestionPreferences(questionId, null, null, true);
  }

  function getCollection(kind) {
    var user = getUser();
    var query = supabaseClient
      .from('tax_question_user_state')
      .select('question_id,note,wrong_count,correct_count,last_is_correct,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(200);

    if (kind === 'wrong') query = query.eq('is_in_wrong_book', true);
    if (kind === 'favorite') query = query.eq('is_favorite', true);
    if (kind === 'note') query = query.neq('note', '');

    return query.then(function (result) {
      var states = unwrap(result, '题目列表加载失败') || [];
      var ids = states.map(function (row) { return row.question_id; });
      return getQuestions(ids).then(function (questions) {
        var stateById = {};
        states.forEach(function (state) { stateById[state.question_id] = state; });
        return questions.map(function (question) {
          return { question: question, state: stateById[question.id] };
        });
      });
    });
  }

  function getAiHistory(questionId) {
    var user = getUser();
    return supabaseClient
      .from('tax_ai_threads')
      .select('id')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(function (threadResult) {
        var thread = unwrap(threadResult, 'AI会话加载失败');
        if (!thread) return { threadId: null, messages: [] };
        return supabaseClient
          .from('tax_ai_messages')
          .select('role,content,created_at')
          .eq('thread_id', thread.id)
          .order('created_at')
          .limit(30)
          .then(function (messageResult) {
            return {
              threadId: thread.id,
              messages: unwrap(messageResult, 'AI消息加载失败') || []
            };
          });
      });
  }

  function getAccessToken() {
    return supabaseClient.auth.getSession().then(function (result) {
      var session = result.data && result.data.session;
      if (!session || !session.access_token) throw new Error('登录状态已失效，请重新登录。');
      return session.access_token;
    });
  }

  return {
    loadDashboard: loadDashboard,
    getLatestSession: getLatestSession,
    createChapterSession: createChapterSession,
    createCollectionSession: createCollectionSession,
    getSession: getSession,
    getQuestions: getQuestions,
    getAttempts: getAttempts,
    saveProgress: saveProgress,
    completeSession: completeSession,
    recordAnswer: recordAnswer,
    getQuestionState: getQuestionState,
    setFavorite: setFavorite,
    saveNote: saveNote,
    removeFromWrongBook: removeFromWrongBook,
    getCollection: getCollection,
    getAiHistory: getAiHistory,
    getAccessToken: getAccessToken
  };
})();
