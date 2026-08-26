const assert = require('assert');

process.env.OPENAI_API_KEY = 'test-only-openai-key';
process.env.OPENAI_MODEL = 'gpt-5.4-mini';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.TAX_AI_DAILY_LIMIT = '20';

class MockResponse {
  constructor(status, body, headers) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.body = body;
    this.headers = { get: (name) => (headers || {})[name.toLowerCase()] || null };
  }
  async text() {
    return this.body == null ? '' : JSON.stringify(this.body);
  }
  async json() {
    return this.body;
  }
}

const calls = [];
let questionMode = 'objective';
global.fetch = async function (url, options) {
  calls.push({ url, options });
  if (url.endsWith('/auth/v1/user')) {
    return new MockResponse(200, { id: 'user-1' });
  }
  if (url.includes('/rpc/consume_tax_ai_quota')) {
    return new MockResponse(200, [{ allowed: true, remaining: 19, retry_after_seconds: 0, reason: 'ok' }]);
  }
  if (url.includes('/tax_questions?')) {
    if (questionMode === 'subjective') {
      return new MockResponse(200, [{
        id: 'tax-topic-01-subjective-p00027',
        question_type: 'calculation',
        stem: '测试主观题干',
        options: [],
        correct_answer: [],
        answer_raw: '',
        explanation: '原书答案及解析'
      }]);
    }
    return new MockResponse(200, [{
      id: 'tax-topic-01-p00064',
      question_type: 'single_choice',
      stem: '测试题干',
      options: [{ label: 'A', text: '选项A' }, { label: 'B', text: '选项B' }],
      correct_answer: ['B'],
      explanation: '原解析'
    }]);
  }
  if (url.includes('/tax_question_attempts?')) {
    if (questionMode === 'subjective') throw new Error('Subjective AI must not require an objective attempt.');
    return new MockResponse(200, [{ selected_answer: ['A'] }]);
  }
  if (url.includes('/tax_practice_sessions?')) {
    return new MockResponse(200, [{
      id: '22222222-2222-2222-2222-222222222222',
      question_ids: ['tax-topic-01-subjective-p00027']
    }]);
  }
  if (url.includes('/tax_subjective_attempts?on_conflict=')) {
    const payload = JSON.parse(options.body);
    return new MockResponse(201, [{
      id: '33333333-3333-3333-3333-333333333333',
      ...payload
    }]);
  }
  if (url.includes('/tax_subjective_attempts?id=eq.')) {
    const payload = JSON.parse(options.body);
    return new MockResponse(200, [{
      id: '33333333-3333-3333-3333-333333333333',
      question_id: 'tax-topic-01-subjective-p00027',
      answer_text: '测试主观题作答内容，包含判断依据、计算过程和最终结论。',
      ...payload
    }]);
  }
  if (url.includes('/rpc/record_tax_subjective_review')) {
    return new MockResponse(200, [{
      review_id: '44444444-4444-4444-4444-444444444444',
      viewed_at: '2026-08-26T00:00:00Z'
    }]);
  }
  if (url.endsWith('/rest/v1/tax_ai_threads')) {
    return new MockResponse(201, [{ id: '11111111-1111-1111-1111-111111111111' }]);
  }
  if (url.includes('/tax_ai_messages?')) {
    return new MockResponse(200, [{
      role: 'user',
      content: '为什么A错误？',
      created_at: '2026-08-24T00:00:00Z'
    }]);
  }
  if (url.endsWith('/rest/v1/tax_ai_messages')) {
    return new MockResponse(201, null);
  }
  if (url.includes('/rpc/record_tax_ai_usage')) {
    return new MockResponse(200, null);
  }
  if (url === 'https://api.openai.com/v1/responses') {
    const payload = JSON.parse(options.body);
    if (payload.text && payload.text.format) {
      return new MockResponse(200, {
        output_text: JSON.stringify({
          score: 82,
          summary: '核心得分点基本完整。',
          strengths: ['判断主体正确'],
          omissions: ['遗漏纳税义务发生时间'],
          corrections: ['补充抵扣条件'],
          suggestions: ['按步骤展开'],
          referenceApproach: '先定主体，再定时间和税基。'
        }),
        usage: { input_tokens: 200, output_tokens: 100 }
      });
    }
    return new MockResponse(200, {
      output_text: 'AI辅助解释\n知识点讲解\n测试\n具体例子\n测试\n一眼看懂批注\n测试',
      usage: { input_tokens: 120, output_tokens: 60 }
    });
  }
  throw new Error('Unexpected request: ' + url);
};

const handler = require('../api/tax-ai.js');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

(async function run() {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-user-token',
      'x-supabase-publishable-key': 'test-only-publishable-key',
      host: 'localhost:3000',
      origin: 'http://localhost:3000'
    },
    body: {
      questionId: 'tax-topic-01-p00064',
      message: '为什么A错误？',
      threadId: ''
    }
  };
  const res = createResponse();
  await handler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.threadId, '11111111-1111-1111-1111-111111111111');
  assert.strictEqual(res.body.remaining, 19);
  assert.strictEqual(res.body.messages.at(-1).role, 'assistant');
  assert.ok(calls.some((call) => call.url === 'https://api.openai.com/v1/responses'));
  assert.ok(!JSON.stringify(res.body).includes(process.env.OPENAI_API_KEY));
  assert.ok(calls.filter((call) => call.url.startsWith(process.env.SUPABASE_URL))
    .every((call) => call.options.headers.apikey === 'test-only-publishable-key'));

  const openAiCall = calls.find((call) => call.url === 'https://api.openai.com/v1/responses');
  const openAiBody = JSON.parse(openAiCall.options.body);
  assert.strictEqual(openAiBody.store, false);
  assert.ok(openAiBody.input.includes('【原题，不可修改】'));
  assert.ok(openAiBody.input.includes('【用户真实作答】\nA'));
  assert.ok(openAiBody.input.includes('【标准答案，不可修改】\nB'));
  assert.ok(openAiBody.input.includes('【原解析，不可修改】\n原解析'));

  questionMode = 'subjective';
  calls.length = 0;
  const subjectiveReq = {
    method: 'POST',
    headers: req.headers,
    body: {
      questionId: 'tax-topic-01-subjective-p00027',
      message: '请解释计算步骤。',
      threadId: ''
    }
  };
  const subjectiveRes = createResponse();
  await handler(subjectiveReq, subjectiveRes);

  assert.strictEqual(subjectiveRes.statusCode, 200);
  assert.ok(!calls.some((call) => call.url.includes('/tax_question_attempts?')));
  const subjectiveOpenAiCall = calls.find((call) => call.url === 'https://api.openai.com/v1/responses');
  const subjectiveOpenAiBody = JSON.parse(subjectiveOpenAiCall.options.body);
  assert.strictEqual(subjectiveOpenAiBody.model, 'gpt-5.4-mini');
  assert.ok(subjectiveOpenAiBody.input.includes('【原书答案及解析，不可修改】'));
  assert.ok(subjectiveOpenAiBody.input.includes('主观题自测，用户未提交文字答案。'));

  calls.length = 0;
  const gradeReq = {
    method: 'POST',
    headers: req.headers,
    body: {
      action: 'grade',
      sessionId: '22222222-2222-2222-2222-222222222222',
      questionId: 'tax-topic-01-subjective-p00027',
      answerText: '测试主观题作答内容，包含判断依据、计算过程和最终结论。'
    }
  };
  const gradeRes = createResponse();
  await handler(gradeReq, gradeRes);

  assert.strictEqual(gradeRes.statusCode, 200);
  assert.strictEqual(gradeRes.body.attempt.status, 'graded');
  assert.strictEqual(gradeRes.body.attempt.ai_score, 82);
  assert.strictEqual(gradeRes.body.review.question_id, 'tax-topic-01-subjective-p00027');
  const gradeOpenAiCall = calls.find((call) => call.url === 'https://api.openai.com/v1/responses');
  const gradeOpenAiBody = JSON.parse(gradeOpenAiCall.options.body);
  assert.strictEqual(gradeOpenAiBody.text.format.type, 'json_schema');
  assert.ok(gradeOpenAiBody.input.includes('【用户作答】'));
  assert.ok(gradeOpenAiBody.input.includes('【原书答案及解析，不可修改】'));
  assert.ok(calls.some((call) => call.url.includes('/tax_subjective_attempts?on_conflict=')));
  assert.ok(calls.some((call) => call.url.includes('/rpc/record_tax_subjective_review')));

  const healthRes = createResponse();
  await handler({ method: 'GET', headers: {} }, healthRes);
  assert.strictEqual(healthRes.statusCode, 200);
  assert.strictEqual(healthRes.body.status, 'ready');
  assert.ok(!JSON.stringify(healthRes.body).includes(process.env.OPENAI_API_KEY));

  const openAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const missingConfigRes = createResponse();
  await handler({ method: 'GET', headers: {} }, missingConfigRes);
  assert.strictEqual(missingConfigRes.statusCode, 503);
  assert.strictEqual(missingConfigRes.body.status, 'configuration_required');

  const unauthenticatedRes = createResponse();
  await handler({ method: 'POST', headers: {}, body: {} }, unauthenticatedRes);
  assert.strictEqual(unauthenticatedRes.statusCode, 401);
  assert.strictEqual(unauthenticatedRes.body.error, '请先登录。');
  process.env.OPENAI_API_KEY = openAiKey;

  process.stdout.write('PASS AI endpoint verifies context, grades subjective answers, and keeps secrets server-side\n');
})().catch(function (error) {
  process.stderr.write(error.stack + '\n');
  process.exit(1);
});
