const assert = require('node:assert/strict');
const Sync = require('../js/workspaceSync');
const Logic = require('../js/workspaceLogic');
const copy = value => JSON.parse(JSON.stringify(value));
class MemoryStorage {
  constructor() { this.items = new Map(); }
  get length() { return this.items.size; }
  key(i) { return [...this.items.keys()][i]; }
  getItem(key) { return this.items.get(key) ?? null; }
  setItem(key, value) { this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
}
(async () => {
  const scope = { user_id: 'a', id: 'cpa-2026' };
  let row = { ...scope, revision: 0, status: 'active', data: { subjects: [] } };
  let offline = false, writes = 0;
  const remote = {
    read: async s => { if (offline) throw Error('offline'); assert.equal(s.user_id, 'a'); return copy(row); },
    save: async (s, p) => {
      if (offline) throw Error('offline');
      writes++;
      assert.deepEqual(s, scope);
      if (row.last_write_id === p.writeId) return { row: copy(row) };
      if (row.revision !== p.revision) return { conflict: true, row: copy(row) };
      row = { ...row, revision: row.revision + 1, last_write_id: p.writeId, data: copy(p.data) };
      return { row: copy(row) };
    }
  };
  const storage = new MemoryStorage();
  const a = new Sync({ storage, remote, writer: 'tab-a' });
  await a.load(scope);
  a.stage(scope, { subjects: ['CPA'] });
  await a.flush(scope);
  assert.deepEqual(row.data.subjects, ['CPA']);
  offline = true;
  a.stage(scope, { subjects: ['offline'] });
  assert.equal(await a.flush(scope), false);
  assert.equal(a.pending(scope).length, 1);
  const reopened = new Sync({ storage, remote, writer: 'reopened' });
  assert.deepEqual((await reopened.load(scope)).data.subjects, ['offline']);
  const fresh = new Sync({ storage: new MemoryStorage(), remote, writer: 'fresh' });
  const previousWrites = writes;
  await assert.rejects(fresh.load(scope), /云端空间加载失败/);
  assert.equal(writes, previousWrites);
  offline = false;
  row.revision++;
  row.data = { subjects: ['phone'] };
  const conflict = new Sync({ storage, remote, writer: 'conflict' });
  assert.equal((await conflict.load(scope)).conflict, true);
  assert.equal(await conflict.flush(scope), false);
  assert.deepEqual(row.data.subjects, ['phone']);
  await conflict.resolve(scope, false);
  assert.equal(conflict.pending(scope).length, 0);
  assert.ok([...storage.items.keys()].some(key => key.includes(':recovery:')));
  const b = new Sync({ storage, remote, writer: 'tab-b' });
  await b.load(scope);
  b.stage(scope, { subjects: ['next'] });
  assert.equal(b.pending({ user_id: 'a', id: 'tax-2026' }).length, 0);
  assert.equal(b.pending({ user_id: 'b', id: 'cpa-2026' }).length, 0);
  await b.flush(scope);
  assert.deepEqual(row.data.subjects, ['next']);
  // Mutations arriving while an upload is in flight must use the returned revision.
  let release;
  const slow = { ...remote, save: async (s, p) => { await new Promise(resolve => { release = resolve; }); return remote.save(s, p); } };
  const inFlight = new Sync({ storage, remote: slow, writer: 'slow' });
  await inFlight.load(scope);
  inFlight.stage(scope, { subjects: ['one'] });
  const done = inFlight.flush(scope);
  inFlight.stage(scope, { subjects: ['two'] });
  release();
  await new Promise(resolve => setImmediate(resolve));
  release();
  await done;
  assert.deepEqual(row.data.subjects, ['two']);
  // A resumed tab must never erase a newer draft written by the original tab.
  const adoptionStorage = new MemoryStorage();
  let adoptionRow = { ...scope, revision: 0, status: 'active', data: { subjects: [] } };
  let adoptionWrites = 0, holdAdoption = false, releaseAdoption;
  const adoptionRemote = {
    read: async () => copy(adoptionRow),
    save: async (_, pending) => {
      adoptionWrites++;
      if (holdAdoption) await new Promise(resolve => { releaseAdoption = resolve; });
      if (pending.revision !== adoptionRow.revision) return { conflict: true, row: copy(adoptionRow) };
      adoptionRow = { ...adoptionRow, revision: adoptionRow.revision + 1, last_write_id: pending.writeId, data: copy(pending.data) };
      return { row: copy(adoptionRow) };
    }
  };
  const originalTab = new Sync({ storage: adoptionStorage, remote: adoptionRemote, writer: 'original' });
  const resumedTab = new Sync({ storage: adoptionStorage, remote: adoptionRemote, writer: 'resumed' });
  await originalTab.load(scope);
  originalTab.stage(scope, { subjects: ['old draft'] });
  await resumedTab.load(scope);
  originalTab.stage(scope, { subjects: ['new draft before upload'] });
  assert.equal(await resumedTab.flush(scope), false);
  assert.equal(adoptionWrites, 0);
  assert.deepEqual(originalTab.pending(scope)[0].value.data.subjects, ['new draft before upload']);

  await resumedTab.load(scope);
  holdAdoption = true;
  const adoptionUpload = resumedTab.flush(scope);
  originalTab.stage(scope, { subjects: ['new draft during upload'] });
  releaseAdoption();
  await adoptionUpload;
  assert.deepEqual(adoptionRow.data.subjects, ['new draft before upload']);
  assert.equal(originalTab.pending(scope).length, 1);
  assert.deepEqual(originalTab.pending(scope)[0].value.data.subjects, ['new draft during upload']);
  const recoveredTab = new Sync({ storage: adoptionStorage, remote: adoptionRemote, writer: 'recovered' });
  const recoveredDraft = await recoveredTab.load(scope);
  assert.equal(recoveredDraft.conflict, true);
  assert.deepEqual(recoveredDraft.data.subjects, ['new draft during upload']);

  const template = { subjects: [{ id: 'old', name: '会计', rounds: [{ id: 'old-round', deadline: '2026-08-23', totalWork: 50, checkins: [{ amount: 30 }], courseItems: [{ done: true }], restDays: ['2026-01-01'] }] }], focus_sessions: [{ actual_minutes: 45 }] };
  const original = copy(template);
  const freshYear = Logic.freshData('cpa', 2027, template);
  assert.deepEqual(template, original);
  assert.equal(freshYear.examDate, '');
  assert.deepEqual(freshYear.focus_sessions, []);
  assert.deepEqual(freshYear.subjects[0].rounds[0].checkins, []);
  assert.deepEqual(freshYear.subjects[0].rounds[0].courseItems, []);
  assert.notEqual(freshYear.subjects[0].id, 'old');
  assert.equal(Logic.freshData('tax_advisor', 2026).subjects.length, 5);
  console.log('PASS workspace templates, account/year isolation, offline preservation, conflict recovery, serialized revision writes, resumed-tab draft preservation');
})().catch(error => { console.error(error); process.exitCode = 1; });
