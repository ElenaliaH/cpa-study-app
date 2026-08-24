const assert = require('assert');
const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260824_tax_practice.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

const expectedTables = [
  'tax_chapters',
  'tax_questions',
  'tax_question_assets',
  'tax_practice_sessions',
  'tax_question_attempts',
  'tax_question_user_state',
  'tax_ai_threads',
  'tax_ai_messages',
  'tax_ai_usage_daily'
];

for (const table of expectedTables) {
  assert.match(sql, new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + table));
  assert.match(sql, new RegExp('ALTER TABLE public\\.' + table + ' ENABLE ROW LEVEL SECURITY'));
}

assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_tax_answer/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.consume_tax_ai_quota/);
assert.match(sql, /auth\.uid\(\)/);
assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+public\.user_app_data\b/i);

process.stdout.write('PASS migration creates isolated RLS tables without destructive statements\n');
