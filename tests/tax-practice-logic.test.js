const assert = require('assert');
const logic = require('../js/taxPracticeLogic.js');

function test(name, fn) {
  try {
    fn();
    process.stdout.write('PASS ' + name + '\n');
  } catch (error) {
    process.stderr.write('FAIL ' + name + '\n');
    throw error;
  }
}

test('normalizes and sorts answers', function () {
  assert.deepStrictEqual(logic.normalizeAnswer(['c', 'A', 'C', '', '2']), ['A', 'C']);
});

test('compares multiple-choice answers without depending on order', function () {
  assert.strictEqual(logic.isCorrect(['C', 'A'], ['A', 'C']), true);
  assert.strictEqual(logic.isCorrect(['A'], ['A', 'C']), false);
});

test('shuffles without mutating the source array', function () {
  const source = ['a', 'b', 'c', 'd'];
  const values = [0.1, 0.7, 0.2];
  let index = 0;
  const shuffled = logic.shuffle(source, function () {
    return values[index++];
  });
  assert.deepStrictEqual(source, ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(shuffled, ['b', 'd', 'c', 'a']);
});

test('calculates per-chapter and total progress', function () {
  const dashboard = logic.calculateDashboard(
    [
      { id: 'one', question_count: 4 },
      { id: 'two', question_count: 6 }
    ],
    [
      { chapter_id: 'one', correct_count: 2, wrong_count: 0 },
      { chapter_id: 'one', correct_count: 0, wrong_count: 1 },
      { chapter_id: 'two', correct_count: 1, wrong_count: 1 }
    ]
  );

  assert.strictEqual(dashboard.totalQuestions, 10);
  assert.strictEqual(dashboard.totalAnswered, 3);
  assert.strictEqual(dashboard.totalCorrectRate, 60);
  assert.strictEqual(dashboard.totalProgressRate, 30);
  assert.strictEqual(dashboard.chapters[0].progressRate, 50);
  assert.strictEqual(dashboard.chapters[0].correctRate, 67);
});

test('keeps objective and subjective round progress independent', function () {
  const dashboard = logic.calculateDashboard(
    [{ id: 'one', question_count: 10 }],
    [{ question_id: 'q1', chapter_id: 'one', correct_count: 3, wrong_count: 0 }],
    [{ question_id: 's1', chapter_id: 'one' }],
    [{ chapter_id: 'one', answered_count: 0, status: 'active' }]
  );
  assert.strictEqual(dashboard.chapters[0].lifetimeAnswered, 2);
  assert.strictEqual(dashboard.chapters[0].answered, 1);
  assert.strictEqual(dashboard.chapters[0].progressRate, 10);
  assert.strictEqual(dashboard.chapters[0].scopes.objective.answered, 0);
  assert.strictEqual(dashboard.chapters[0].scopes.subjective.answered, 1);
});

test('formats inferred question types', function () {
  assert.strictEqual(logic.formatQuestionType('multiple_choice_inferred'), '多选题');
  assert.strictEqual(logic.formatQuestionType('single_choice_inferred'), '单选题');
  assert.strictEqual(logic.formatQuestionType('calculation'), '计算问答题');
  assert.strictEqual(logic.formatQuestionType('comprehensive'), '综合题');
});
