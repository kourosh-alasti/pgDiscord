/**
 * Quick validation script for the read-only query filter.
 * Run: npx tsx scripts/test-query-filter.ts
 */
import { validateReadOnlyQuery, QueryRejectedError } from '../src/safety/query-filter';

const allowed = [
  'SELECT 1',
  'SELECT * FROM users WHERE id = 1',
  'WITH cte AS (SELECT 1 AS n) SELECT * FROM cte',
  'EXPLAIN SELECT * FROM users',
  'SHOW timezone',
  'VALUES (1, 2), (3, 4)',
  'SELECT 1 UNION SELECT 2',
  'SELECT 1 UNION ALL SELECT 2',
];

const blocked = [
  'INSERT INTO users (name) VALUES (\'test\')',
  'UPDATE users SET name = \'x\'',
  'DELETE FROM users',
  'DROP TABLE users',
  'TRUNCATE users',
  'ALTER TABLE users ADD COLUMN x int',
  'CREATE TABLE foo (id int)',
  'GRANT SELECT ON users TO public',
  'SELECT * FROM users FOR UPDATE',
  'SELECT * INTO temp_table FROM users',
  'EXPLAIN DELETE FROM users',
  'SHOW timezone; DELETE FROM users',
  'COPY users TO \'/tmp/out.csv\'',
  'WITH cte AS (DELETE FROM users RETURNING *) SELECT 1',
];

let passed = 0;
let failed = 0;

for (const sql of allowed) {
  try {
    validateReadOnlyQuery(sql);
    console.log(`✅ ALLOWED: ${sql.slice(0, 60)}`);
    passed++;
  } catch (err) {
    console.error(`❌ SHOULD ALLOW: ${sql}`);
    console.error(`   ${err instanceof QueryRejectedError ? err.message : err}`);
    failed++;
  }
}

for (const sql of blocked) {
  try {
    validateReadOnlyQuery(sql);
    console.error(`❌ SHOULD BLOCK: ${sql}`);
    failed++;
  } catch (err) {
    console.log(`✅ BLOCKED: ${sql.slice(0, 60)}`);
    passed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
