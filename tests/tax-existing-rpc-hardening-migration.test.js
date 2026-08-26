const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826_tax_existing_rpc_hardening.sql'
), 'utf8');

for (const signature of [
  'record_tax_answer\\(uuid, text, jsonb, integer\\)',
  'consume_tax_ai_quota\\(integer, integer\\)',
  'update_tax_question_preferences\\(text, boolean, text, boolean\\)',
  'record_tax_ai_usage\\(integer, integer\\)'
]) {
  assert.match(sql, new RegExp(signature + ' FROM anon'));
  assert.match(sql, new RegExp(signature + ' TO authenticated'));
}
assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);

process.stdout.write('PASS existing tax RPC hardening removes anonymous access\n');
