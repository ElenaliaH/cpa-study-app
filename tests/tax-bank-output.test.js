const assert = require('assert');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(
  __dirname,
  '..',
  'work',
  'tax-bank',
  'tax-question-bank.publishable.json'
);

if (!fs.existsSync(outputPath)) {
  process.stdout.write('SKIP publishable question bank has not been generated\n');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
assert.strictEqual(data.chapters.length, 14);
assert.ok(data.questions.length > 1000);
assert.strictEqual(new Set(data.questions.map((question) => question.id)).size, data.questions.length);

for (const chapter of data.chapters) {
  const questions = data.questions.filter((question) => question.chapterId === chapter.id);
  assert.strictEqual(questions.length, chapter.questionCount);
  questions.forEach(function (question, index) {
    assert.strictEqual(question.sequenceNo, index + 1);
  });
}

for (const question of data.questions) {
  assert.strictEqual(question.needsReview, false);
  assert.ok(question.stem);
  assert.ok(question.explanation);
  assert.ok(question.options.length >= 2);
  assert.ok(question.correctAnswer.length >= 1);
  const labels = new Set(question.options.map((option) => option.label));
  for (const answer of question.correctAnswer) assert.ok(labels.has(answer));
}

process.stdout.write('PASS publishable question bank is complete and internally consistent\n');
