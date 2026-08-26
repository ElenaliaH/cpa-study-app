const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js', 'taxPractice.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'js', 'taxPracticeData.js'), 'utf8');
const demo = fs.readFileSync(path.join(root, 'tests', 'tax-practice-demo.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

function test(name, fn) {
  try {
    fn();
    process.stdout.write('PASS ' + name + '\n');
  } catch (error) {
    process.stderr.write('FAIL ' + name + '\n');
    throw error;
  }
}

test('places question navigation before grading and answer analysis', function () {
  const questionIndex = html.indexOf('id="taxQuestionCard"');
  const navigationIndex = html.indexOf('class="tax-practice-nav"');
  const gradeIndex = html.indexOf('id="taxGradeCard"');
  const resultIndex = html.indexOf('id="taxResultCard"');
  assert(questionIndex >= 0);
  assert(navigationIndex > questionIndex);
  assert(navigationIndex < gradeIndex);
  assert(navigationIndex < resultIndex);
});

test('shows remove action before favorite action in question header', function () {
  const removeIndex = html.indexOf('id="taxRemoveWrongBtn"');
  const favoriteIndex = html.indexOf('id="taxFavoriteBtn"');
  assert(removeIndex >= 0);
  assert(removeIndex < favoriteIndex);
  assert(ui.includes("session.mode === 'wrong'"));
  assert(ui.includes('removeCurrentWrongQuestion'));
});

test('supports deliberate horizontal swipe without blocking vertical scroll', function () {
  assert(ui.includes("addEventListener('touchstart'"));
  assert(ui.includes("addEventListener('touchend'"));
  assert(ui.includes('Math.abs(deltaX) < 56'));
  assert(css.includes('touch-action: pan-y'));
});

test('renders AI pending and persistent failure states and sends ask action', function () {
  assert(ui.includes("action: 'ask'"));
  assert(ui.includes('getAiRequestCredentials'));
  assert(ui.includes("'X-Supabase-Publishable-Key'"));
  assert(data.includes('getAiRequestCredentials: getAiRequestCredentials'));
  assert(demo.includes('getAiRequestCredentials: function ()'));
  assert(ui.includes('GPT 正在生成'));
  assert(ui.includes("error: true"));
  assert(ui.includes('AI解释生成超时，请重新发送'));
  assert(css.includes('.tax-ai-message.pending'));
  assert(css.includes('.tax-ai-message.error'));
});

test('updates wrong-practice session question queue in real and demo adapters', function () {
  assert(data.includes('function updateSessionQuestions('));
  assert(data.includes('updateSessionQuestions: updateSessionQuestions'));
  assert(demo.includes('updateSessionQuestions: function ('));
});

test('creates new chapter sessions from the complete active bank only', function () {
  assert(data.includes("'wang-tingxi-word-v2-complete-20260826'"));
  assert(data.includes("'wang-tingxi-word-v2-subjective-table-20260826'"));
  assert(data.includes(".in('source_version', ACTIVE_BANK_SOURCE_VERSIONS)"));
  assert(demo.includes('tax-subjective-bank.publishable.json'));
  assert(!demo.includes('tax-demo-subjective-001'));
});
