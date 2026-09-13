const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const ids = new Set(read('work/tax-bank/tax-question-bank.publishable.json').questions.map(q => q.id));
for (const [roman, originalCount, questionCount, chapters] of [['i', 550, 752, 12], ['ii', 550, 710, 10]]) {
  const bank = read(`work/tax-advisor-bank/tax-law-${roman}.publishable.json`);
  const source = read(`work/tax-advisor-bank/tax-law-${roman}.corrected-source.json`);
  const audit = read(`work/tax-advisor-bank/tax-law-${roman}.audit.json`);
  const subject = roman === 'i' ? 1 : 2;
  const archive = fs.readFileSync(path.join(root, '税务师题库', '结构化题库', `税法${subject}_结构化JSON.zip`));
  assert.equal(crypto.createHash('sha256').update(archive).digest('hex'), bank.metadata.sourceArchiveSha256);
  assert.equal(bank.metadata.examType, 'tax_advisor');
  assert.equal(bank.metadata.subjectCode, `tax_law_${roman}`);
  assert.equal(bank.questions.length, questionCount);
  assert.equal(bank.chapters.length, chapters);
  assert.equal(bank.chapters.reduce((n, c) => n + c.questionCount, 0), questionCount);
  assert.equal(bank.chapters.reduce((n, c) => n + c.originalQuestionCount, 0), originalCount);
  assert.deepEqual([...new Set(bank.questions.map(q => q.sourceQuestionNo))].sort((a, b) => a - b), Array.from({ length: 550 }, (_, i) => i + 1));
  for (const q of bank.questions) {
    assert.equal(ids.has(q.id), false, 'Question ID overlaps another bank');
    ids.add(q.id);
    assert.equal(q.bankId, bank.metadata.bankId);
    assert.ok(q.stem.trim() && q.explanation.trim());
    assert.ok(q.correctAnswer.length);
    assert.ok(q.correctAnswer.every(a => q.options.some(o => o.label === a)));
    assert.deepEqual(q.options.map(o => o.label), q.options.length === 5 ? [...'ABCDE'] : [...'ABCD']);
    assert.equal(q.questionType, q.correctAnswer.length > 1 ? 'multiple_choice' : 'single_choice');
    if (q.sourcePartNo) {
      assert.match(q.stem, /【公共材料/);
      assert.match(q.stem, new RegExp(`【第${q.sourcePartNo}问】`));
      const parent = source.questions.find(s => (s.number || s.question_no) === q.sourceQuestionNo);
      assert.ok((parent.sub_questions || parent.subquestions).some(c => Number(String(c.no).replace(/[()（）]/g, '')) === q.sourcePartNo));
    }
  }
  assert.equal(new Set(audit.map(a => a.number)).size, bank.metadata.correctedOriginals);
  assert.ok(audit.every(a => a.pages.length && Object.keys(a.changes).length));
  if (subject === 1) {
    assert.equal(bank.questions.find(q => q.sourceQuestionNo === 256).questionType, 'single_choice');
    assert.equal(bank.questions.find(q => q.sourceQuestionNo === 154).options[4].label, 'E');
  } else {
    assert.match(bank.questions.find(q => q.sourceQuestionNo === 120).stem, /2023年取得第一笔收入/);
    for (const [n, p] of [[139,4],[148,3],[149,1],[149,6],[251,4],[257,2],[259,4],[259,5],[264,4],[413,2]]) {
      const q = bank.questions.find(q => q.sourceQuestionNo === n && q.sourcePartNo === p);
      assert.ok(q.explanation.length > 20);
      assert.ok(!q.explanation.startsWith('【原题整组解析】'));
    }
  }
}
console.log('PASS tax-advisor banks: 1100 originals, 1462 answer units, provenance, corrections, labels, grading and disjoint IDs');
