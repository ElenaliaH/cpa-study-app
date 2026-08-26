const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260826_tax_subjective_rpc_hardening.sql'
), 'utf8');

assert.match(sql, /record_tax_subjective_review\(uuid, text\) FROM anon/);
assert.match(sql, /refresh_tax_session_counts\(uuid\) FROM anon/);
assert.match(sql, /save_tax_subjective_answer\(uuid, text, text\) FROM anon/);
assert.match(sql, /record_tax_subjective_review\(uuid, text\) TO authenticated/);
assert.match(sql, /refresh_tax_session_counts\(uuid\) TO authenticated/);
assert.match(sql, /save_tax_subjective_answer\(uuid, text, text\) TO authenticated/);
assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);

process.stdout.write('PASS subjective RPC hardening removes anonymous access\n');
