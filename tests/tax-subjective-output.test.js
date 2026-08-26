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
assert.ok(data.questions.length >= 10);
assert.strictEqual(new Set(data.questions.map((question) => question.id)).size, data.questions.length);

for (const question of data.questions) {
  assert.ok(['subjective', 'calculation', 'comprehensive'].includes(question.questionType));
  assert.strictEqual(question.needsReview, false);
  assert.ok(question.stem.length >= 20);
  assert.ok(question.explanation.length >= 20);
  assert.deepStrictEqual(question.options, []);
  assert.deepStrictEqual(question.correctAnswer, []);
  assert.ok(question.chapterId);
  assert.ok(question.sourceParagraph > 0);
}

process.stdout.write('PASS subjective output contains conservative complete Word-sourced items\n');
