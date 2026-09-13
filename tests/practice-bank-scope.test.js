const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Logic = require('../js/workspaceLogic');

(async () => {
  const subjects = Logic.subjectsFor('tax_advisor');
  assert.equal(subjects.length, 5);
  const banks = subjects.map(s => ({ id: 'bank-' + s.code, exam_type: 'tax_advisor', subject_code: s.code, source_versions: ['fixture'] }));
  banks.unshift({ id: 'cpa-tax', exam_type: 'cpa', subject_code: 'tax_law', source_versions: ['fixture'] });
  for (const subject of subjects) {
    const chosen = Logic.practiceSelection('tax_advisor', banks, subject.code, 'cpa-tax');
    assert.deepEqual(chosen.banks.map(b => b.id), ['bank-' + subject.code]);
    assert.equal(chosen.bank.id, 'bank-' + subject.code);
  }
  assert.equal(Logic.practiceSelection('cpa', banks, 'accounting', 'cpa-tax').bank, null);
  assert.equal(Logic.practiceSelection('tax_advisor', [], 'tax_law', 'cpa-tax').bank, null);
  assert.equal(Logic.practiceSelection('tax_advisor', banks, 'tax_law_ii', 'bank-tax_law_i').bank.id, 'bank-tax_law_ii');

  let workspace = { id: 'tax-2026', exam_type: 'tax_advisor' };
  const storage = new Map();
  const queries = [];
  const context = vm.createContext({
    WorkspaceLogic: Logic,
    TaxPracticeLogic: require('../js/taxPracticeLogic'),
    SupabaseStorage: { getCurrentUser: () => ({ id: 'user-a' }) },
    Workspaces: { getCurrent: () => workspace, key: key => workspace.id + ':' + key, assertWritable() {}, isReadOnly: () => false, flush: async () => {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    location: { reload() {} },
    supabaseClient: { from(table) {
      const steps = [];
      queries.push({ table, steps });
      const builder = {};
      for (const name of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'single', 'insert', 'update']) {
        builder[name] = (...args) => { steps.push([name, ...args]); return builder; };
      }
      builder.then = (resolve, reject) => {
        let data = table === 'practice_banks' ? banks : [];
        if (table === 'tax_questions') data = [{ id: 'fixture-q', sequence_no: 1 }];
        const insert = steps.find(s => s[0] === 'insert');
        if (insert) data = { id: 'fixture-session', ...insert[1] };
        return Promise.resolve({ data }).then(resolve, reject);
      };
      return builder;
    } }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/taxPracticeData.js'), 'utf8'), context);
  const api = context.TaxPracticeData;
  await api.prepareWorkspace();
  assert.equal(api.getBankId(), 'bank-tax_law_i');
  await api.getLatestChapterSession('chapter-one', 'objective');
  await api.getSession('existing-session');
  await api.createChapterSession('chapter-one', 'sequential', 'objective');
  await api.resetChapterSession('chapter-one', 'sequential', 'subjective');
  await api.saveProgress('existing-session', 1);
  await api.updateSessionQuestions('existing-session', ['fixture-q'], 0, 0, 0);
  await api.completeSession('existing-session');
  await api.loadDashboard();
  await api.getCollection('wrong');
  for (const query of queries.filter(q => q.table === 'tax_practice_sessions')) {
    const insert = query.steps.find(s => s[0] === 'insert');
    if (insert) {
      assert.equal(insert[1].workspace_id, 'tax-2026');
      assert.equal(insert[1].bank_id, 'bank-tax_law_i');
    } else {
      assert.ok(query.steps.some(s => s[0] === 'eq' && s[1] === 'workspace_id' && s[2] === 'tax-2026'));
      assert.ok(query.steps.some(s => s[0] === 'eq' && s[1] === 'bank_id' && s[2] === 'bank-tax_law_i'));
    }
  }
  for (const query of queries.filter(q => ['tax_question_user_state', 'tax_subjective_reviews'].includes(q.table))) {
    const filter = query.steps.findIndex(s => s[0] === 'eq' && s[1] === 'tax_questions.bank_id');
    const limit = query.steps.findIndex(s => s[0] === 'limit');
    assert.ok(filter >= 0 && (limit < 0 || filter < limit));
  }
  await api.selectSubject('tax_law_ii');
  await api.prepareWorkspace();
  assert.equal(api.getBankId(), 'bank-tax_law_ii');
  workspace = { id: 'cpa-2026', exam_type: 'cpa' };
  await api.prepareWorkspace();
  assert.equal(api.getBankId(), 'cpa-tax');
  await api.selectSubject('accounting');
  await api.prepareWorkspace();
  assert.equal(api.getBankId(), '');
  assert.equal(await api.getLatestSession(), null);
  console.log('PASS bank scopes: five tax subjects, exam isolation, stale selection, scoped queries, session create/reset, empty bank');
})().catch(error => { console.error(error); process.exitCode = 1; });
