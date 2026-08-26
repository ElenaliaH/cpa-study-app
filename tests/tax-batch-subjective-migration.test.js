const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826_tax_batch_subjective.sql'
), 'utf8');

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.tax_subjective_reviews/);
assert.match(sql, /ALTER TABLE public\.tax_subjective_reviews ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /CREATE POLICY tax_subjective_reviews_select_own/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_tax_subjective_review/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.refresh_tax_session_counts/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_tax_subjective_review\(uuid, text\) FROM PUBLIC/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.record_tax_subjective_review\(uuid, text\) TO authenticated/);
assert.match(sql, /'subjective'/);
assert.match(sql, /'calculation'/);
assert.match(sql, /'comprehensive'/);
assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);

process.stdout.write('PASS subjective progress migration is additive and RLS-protected\n');
