const assert = require('assert');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(
  __dirname,
  '..',
  'work',
  'tax-bank',
  'tax-subjective-bank.publishable.json'
);

if (!fs.existsSync(outputPath)) {
  process.stdout.write('SKIP subjective question bank has not been generated\n');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
assert.strictEqual(data.metadata.parserVersion, 2);
assert.strictEqual(data.questions.length, 49);
assert.strictEqual(new Set(data.questions.map((question) => question.id)).size, data.questions.length);
assert.strictEqual(new Set(data.questions.map((question) => question.contentHash)).size, data.questions.length);

for (const question of data.questions) {
  assert.ok(['subjective', 'calculation', 'comprehensive'].includes(question.questionType));
  assert.strictEqual(question.needsReview, false);
  assert.ok(question.stem.length >= 20);
  assert.ok(question.explanation.length >= 20);
  assert.deepStrictEqual(question.options, []);
  assert.deepStrictEqual(question.correctAnswer, []);
  assert.ok(question.chapterId);
  assert.ok(question.sourceParagraph > 0);
  assert.ok(question.sourceLabel);
  assert.ok(!/【答案(?:及解析)?】|【解析】/.test(question.stem));
}

const recoveredQuestionIds = [
  'tax-topic-01-subjective-p02852',
  'tax-topic-01-subjective-p02965',
  'tax-topic-01-subjective-p02989',
  'tax-topic-05-subjective-p04658',
  'tax-topic-05-subjective-p04671',
  'tax-topic-08-subjective-p06527',
  'tax-topic-09-subjective-p07617',
  'tax-topic-09-subjective-p08099',
  'tax-topic-09-subjective-p08508',
  'tax-topic-10-subjective-p09111',
  'tax-topic-10-subjective-p09530',
  'tax-topic-10-subjective-p09547',
  'tax-topic-11-subjective-p10145',
  'tax-topic-11-subjective-p10167',
  'tax-topic-11-subjective-p10257',
  'tax-topic-11-subjective-p10272',
  'tax-topic-11-subjective-p10287',
  'tax-topic-11-subjective-p10304',
  'tax-topic-11-subjective-p10437',
  'tax-topic-11-subjective-p10909'
];
const recoveredQuestions = recoveredQuestionIds.map((id) =>
  data.questions.find((question) => question.id === id)
);
assert.ok(recoveredQuestions.every(Boolean));
assert.ok(recoveredQuestions.every((question) => question.stem.length >= 20));
assert.ok(recoveredQuestions.every((question) => question.explanation.length >= 20));

const flattenedTableQuestions = data.questions.filter((question) =>
  question.stem.includes('【题目表格】') || question.explanation.includes('【答案表格】')
);
assert.strictEqual(flattenedTableQuestions.length, 11);

process.stdout.write('PASS subjective output contains conservative complete Word-sourced items\n');
