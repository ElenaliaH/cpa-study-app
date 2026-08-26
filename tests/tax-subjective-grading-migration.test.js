const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826_tax_subjective_grading.sql'
), 'utf8');

assert.match(sql, /ADD COLUMN IF NOT EXISTS objective_question_count/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS subjective_question_count/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS question_scope/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.tax_subjective_attempts/);
assert.match(sql, /ALTER TABLE public\.tax_subjective_attempts ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /CREATE POLICY tax_subjective_attempts_select_own/);
assert.match(sql, /CREATE POLICY tax_subjective_attempts_insert_own/);
assert.match(sql, /CREATE POLICY tax_subjective_attempts_update_own/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.save_tax_subjective_answer/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_tax_subjective_answer\(uuid, text, text\) FROM PUBLIC/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_tax_subjective_answer\(uuid, text, text\) FROM anon/);
assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);

process.stdout.write('PASS subjective grading migration is additive and RLS-protected\n');
