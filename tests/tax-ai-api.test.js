const assert = require('assert');

process.env.OPENAI_API_KEY = 'test-only-openai-key';
process.env.OPENAI_MODEL = 'gpt-5.4-mini';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-only-publishable-key';
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

  process.stdout.write('PASS AI endpoint verifies context, keeps secrets server-side, and records usage\n');
})().catch(function (error) {
  process.stderr.write(error.stack + '\n');
  process.exit(1);
});
