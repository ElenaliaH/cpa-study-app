const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8'));
    const dir = path.join(__dirname, '../supabase/migrations');
    for (const name of fs.readdirSync(dir).filter(name => /^202608.*\.sql$/.test(name)).sort()) await db.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [a, b]);
    const data = { examDate: '2026-08-23', subjects: [{ id: 's-original', name: '会计', rounds: [{ id: 'r-original', checkins: [{ id: 'c-original', amount: 2 }] }] }], focus_sessions: [{ id: 'f-original', actual_minutes: 45 }] };
    await db.query('INSERT INTO user_app_data(user_id,data) VALUES ($1,$2)', [a, data]);
    await db.exec(`INSERT INTO tax_chapters(id,order_no,title,is_published) VALUES ('chapter-one',1,'Chapter',true);
      INSERT INTO tax_questions(id,chapter_id,sequence_no,question_type,stem,options,correct_answer,content_hash,source_paragraph,is_published)
      VALUES ('question-one','chapter-one',1,'single_choice','Fixture','[]','["A"]','hash-one',1,true),
      ('question-two','chapter-one',2,'calculation','Subjective fixture','[]','[]','hash-two',2,true);`);
    await db.exec(fs.readFileSync(path.join(dir, '20260912032517_dual_study_workspaces.sql'), 'utf8'));
    const taxCodes = ['tax_law_i', 'tax_law_ii', 'tax_practice', 'tax_related_law', 'finance_accounting'];
    for (const code of taxCodes) {
      await db.query("INSERT INTO practice_banks(id,exam_type,subject,subject_code,edition_year,title,status) VALUES ($1,'tax_advisor',$2,$2,2026,'Fixture','published')", ['bank-' + code, code]);
      await db.query("INSERT INTO tax_chapters(id,bank_id,order_no,title,is_published) VALUES ($1,$2,1,'Fixture chapter',true)", ['chapter-' + code, 'bank-' + code]);
      await db.query(`INSERT INTO tax_questions(id,bank_id,chapter_id,sequence_no,question_type,stem,options,correct_answer,content_hash,source_paragraph,is_published)
        VALUES ($1,$2,$3,1,'single_choice','Fixture','[]','["A"]','same-hash-across-banks',1,true)`, ['q-' + code, 'bank-' + code, 'chapter-' + code]);
    }
    await assert.rejects(db.query("INSERT INTO practice_banks(id,exam_type,subject,subject_code,edition_year,title) VALUES ('bad-bank','tax_advisor','Fixture','tax_law',2026,'Fixture')"), /practice_bank_exam_subject/);
    await assert.rejects(db.query("UPDATE tax_questions SET bank_id='bank-tax_law_ii', content_hash='invalid-bank-fixture' WHERE id='q-tax_law_i'"), /foreign key/);
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${a}',false);`);
    const old = (await db.query('SELECT * FROM initialize_study_workspaces()')).rows[0];
    assert.deepEqual(old.data, data);
    assert.equal(old.year, 2026);
    const newData = { subjects: [], focus_sessions: [] };
    const tax = (await db.query("SELECT * FROM create_study_workspace('tax_advisor',2026,$1)", [newData])).rows[0];
    for (const code of taxCodes) {
      const taxSession = (await db.query("INSERT INTO tax_practice_sessions(user_id,workspace_id,bank_id,chapter_id,mode,question_ids) VALUES ($1,$2,$3,$4,'sequential',$5) RETURNING id", [a, tax.id, 'bank-' + code, 'chapter-' + code, ['q-' + code]])).rows[0];
      await db.query("SELECT * FROM record_tax_answer($1,$2,'[\"B\"]',60)", [taxSession.id, 'q-' + code]);
      await db.query("SELECT * FROM update_study_question_preferences($1,$2,true,$3,false)", [tax.id, 'q-' + code, code]);
    }
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM tax_question_user_state WHERE workspace_id=$1', [tax.id])).rows[0].n, 5);
    await assert.rejects(db.query("INSERT INTO tax_practice_sessions(user_id,workspace_id,bank_id,mode,question_ids) VALUES ($1,$2,'bank-tax_law_i','sequential',ARRAY['q-tax_law_ii'])", [a, tax.id]), /another bank/);
    await assert.rejects(db.query("INSERT INTO tax_practice_sessions(user_id,workspace_id,bank_id,mode,question_ids) VALUES ($1,$2,'bank-tax_law_i','sequential',ARRAY['q-tax_law_i'])", [a, old.id]), /unavailable/);
    const cpaNext = (await db.query("SELECT * FROM create_study_workspace('cpa',2027,$1)", [newData])).rows[0];
    const saved = (await db.query('SELECT save_study_workspace($1,0,$2,$3) AS result', [tax.id, newData, 'test-write'])).rows[0].result;
    assert.equal(saved.conflict, false);
    assert.equal(saved.row.revision, 1);
    await assert.rejects(db.query('SELECT save_study_workspace($1,NULL,$2,$3)', [tax.id, newData, 'no-revision']), /revision is required/);
    const retry = (await db.query('SELECT save_study_workspace($1,0,$2,$3) AS result', [tax.id, newData, 'test-write'])).rows[0].result;
    assert.equal(retry.row.revision, 1);
    const conflict = (await db.query('SELECT save_study_workspace($1,0,$2,$3) AS result', [tax.id, newData, 'different-write'])).rows[0].result;
    assert.equal(conflict.conflict, true);
    await assert.rejects(db.query('UPDATE study_workspaces SET data=$1 WHERE id=$2', [newData, old.id]), /permission denied/);
    await db.exec('RESET ROLE; GRANT SELECT, UPDATE ON user_app_data TO authenticated; SET ROLE authenticated;');
    await assert.rejects(db.query('UPDATE user_app_data SET data=$1 WHERE user_id=$2', [newData, a]), /moved to workspaces/);
    const session = (await db.query("INSERT INTO tax_practice_sessions(user_id,workspace_id,bank_id,chapter_id,mode,question_ids) VALUES ($1,$2,'cpa-tax-2026-wang','chapter-one','sequential',ARRAY['question-one','question-two']) RETURNING id", [a, old.id])).rows[0];
    const answer = (await db.query("SELECT * FROM record_tax_answer($1,'question-one','[\"B\"]',60)", [session.id])).rows[0];
    assert.equal(answer.is_correct, false);
    await db.query("SELECT * FROM record_tax_answer($1,'question-one','[\"B\"]',60)", [session.id]);
    const state = (await db.query('SELECT * FROM tax_question_user_state WHERE workspace_id=$1', [old.id])).rows[0];
    assert.equal(state.workspace_id, old.id);
    assert.equal(state.wrong_count, 1);
    await db.query("SELECT * FROM save_tax_subjective_answer($1,'question-two','Fixture answer')", [session.id]);
    assert.equal((await db.query('SELECT workspace_id FROM tax_subjective_attempts')).rows[0].workspace_id, old.id);
    await db.query("SELECT * FROM record_tax_subjective_review($1,'question-two')", [session.id]);
    await db.query("SELECT * FROM update_study_question_preferences($1,'question-one',true,'Note',false)", [cpaNext.id]);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM tax_question_user_state WHERE workspace_id<>$1', [tax.id])).rows[0].n, 2);
    await assert.rejects(db.query("SELECT * FROM update_study_question_preferences($1,'question-one',true,NULL,false)", [tax.id]), /unavailable/);
    await assert.rejects(db.query("INSERT INTO tax_practice_sessions(user_id,workspace_id,bank_id,mode,question_ids) VALUES ($1,$2,'cpa-tax-2026-wang','sequential',ARRAY['question-one'])", [a, tax.id]), /unavailable/);
    await db.query("SELECT * FROM set_study_workspace_status($1,0,'archived')", [old.id]);
    await assert.rejects(db.query("SELECT * FROM record_tax_answer($1,'question-one','[\"B\"]',60)", [session.id]), /unavailable/);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${b}',false);`);
    assert.equal((await db.query('SELECT * FROM study_workspaces WHERE id=$1', [old.id])).rows.length, 0);
    await assert.rejects(db.query('SELECT save_study_workspace($1,0,$2,$3)', [tax.id, newData, 'cross-user']), /not found/);
    await db.exec("RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false);");
    await assert.rejects(db.query('SELECT initialize_study_workspaces()'), /permission denied/);
    console.log('PASS PostgreSQL migration: original JSON unchanged, revision/idempotency, RLS, cross-exam denial, subjective scope, archive guard, stale-client rejection');
  } finally { await db.close(); }
})().catch(error => { console.error(error.message, error.where || ''); process.exitCode = 1; });
