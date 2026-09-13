// Generate reviewed, insert-only SQL. No credentials or network access.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'work/release');
fs.mkdirSync(out, { recursive: true });
const literal = value => "'" + String(value).replace(/'/g, "''") + "'";
const statements = [];
const ids = new Set();
const banks = ['i', 'ii'].map((roman, index) => {
  const bank = JSON.parse(fs.readFileSync(path.join(root, 'work/tax-advisor-bank/tax-law-' + roman + '.publishable.json'), 'utf8'));
  assert.equal(bank.metadata.examType, 'tax_advisor');
  assert.equal(bank.metadata.subjectCode, 'tax_law_' + roman);
  assert.equal(bank.questions.length, [752, 710][index]);
  bank.questions.forEach(q => { assert(!ids.has(q.id)); ids.add(q.id); assert.equal(q.bankId, bank.metadata.bankId); });
  return bank;
});
let setup = 'BEGIN;\n';
for (const bank of banks) {
  const m = bank.metadata;
  const version = m.bankId + '-reviewed-v1';
  setup += `INSERT INTO public.practice_banks(id,exam_type,subject,subject_code,edition_year,title,source_versions,status) VALUES (${literal(m.bankId)},'tax_advisor',${literal(m.subjectCode === 'tax_law_i' ? '税法一' : '税法二')},${literal(m.subjectCode)},2026,${literal(m.title)},ARRAY[${literal(version)}],'draft');\n`;
  for (const c of bank.chapters) {
    setup += `INSERT INTO public.tax_chapters(id,bank_id,order_no,title,question_count,objective_question_count,subjective_question_count,source_version,is_published) VALUES (${literal(c.id)},${literal(m.bankId)},${c.order},${literal(c.title)},${c.questionCount},${c.questionCount},0,${literal(version)},false);\n`;
  }
  for (let start = 0; start < bank.questions.length; start += 40) {
    const rows = bank.questions.slice(start, start + 40).map(q => ({
      id: q.id, bank_id: q.bankId, chapter_id: q.chapterId, sequence_no: q.sequenceNo,
      question_type: q.questionType, source_label: q.sourceLabel, stem: q.stem, options: q.options,
      correct_answer: q.correctAnswer, answer_raw: q.answerRaw, explanation: q.explanation,
      content_hash: q.contentHash, source_paragraph: q.sourceQuestionNo, source_version: version
    }));
    const columns = Object.keys(rows[0]);
    const types = columns.map(c => c + ' ' + (['sequence_no', 'source_paragraph'].includes(c) ? 'integer' : ['options', 'correct_answer'].includes(c) ? 'jsonb' : 'text'));
    statements.push(`INSERT INTO public.tax_questions(${columns.join(',')},is_published) SELECT ${columns.join(',')},false FROM jsonb_to_recordset(${literal(JSON.stringify(rows))}::jsonb) AS q(${types.join(',')});`);
  }
}
setup += 'COMMIT;\n';
fs.writeFileSync(path.join(out, '00-bank-catalog.sql'), setup);
statements.forEach((sql, i) => fs.writeFileSync(path.join(out, 'questions-' + String(i).padStart(3, '0') + '.sql'), sql));
let publish = 'BEGIN;\n';
for (const bank of banks) {
  const id = literal(bank.metadata.bankId);
  publish += `DO $$ BEGIN IF (SELECT count(*) FROM public.tax_questions WHERE bank_id=${id}) <> ${bank.questions.length} THEN RAISE EXCEPTION 'Incomplete question import'; END IF; END $$;\n`;
  publish += `UPDATE public.tax_questions SET is_published=true WHERE bank_id=${id};\nUPDATE public.tax_chapters SET is_published=true WHERE bank_id=${id};\nUPDATE public.practice_banks SET status='published' WHERE id=${id};\n`;
}
publish += 'COMMIT;\n';
fs.writeFileSync(path.join(out, '99-publish-banks.sql'), publish);
console.log(JSON.stringify({ banks: banks.map(b => ({ id: b.metadata.bankId, questions: b.questions.length, chapters: b.chapters.length })), batches: statements.length }));
