import { parse, Statement } from 'pgsql-ast-parser';

export class QueryRejectedError extends Error {
  constructor(
    message: string,
    public readonly reason: string
  ) {
    super(message);
    this.name = 'QueryRejectedError';
  }
}
const BLOCKED_STATEMENT_TYPES = new Set([
  'insert',
  'update',
  'delete',
  'create table',
  'create index',
  'create schema',
  'create extension',
  'create view',
  'create materialized view',
  'create sequence',
  'create type',
  'create function',
  'create trigger',
  'drop table',
  'drop index',
  'drop schema',
  'drop extension',
  'drop view',
  'drop materialized view',
  'drop sequence',
  'drop type',
  'drop function',
  'drop trigger',
  'alter table',
  'alter index',
  'alter schema',
  'alter type',
  'truncate table',
  'truncate',
  'grant',
  'revoke',
  'copy',
  'call',
  'do',
  'vacuum',
  'reindex',
  'cluster',
  'refresh materialized view',
  'lock table',
  'comment',
  'set',
  'reset',
  'discard',
  'deallocate',
  'prepare',
  'execute',
  'listen',
  'unlisten',
  'notify',
  'load',
  'security label',
  'reassign owned',
  'drop owned',
  'alter default privileges',
  'alter extension',
  'alter function',
  'alter procedure',
  'alter event trigger',
  'alter rule',
  'alter sequence',
  'alter system',
  'alter view',
  'alter materialized view',
  'alter operator',
  'alter aggregate',
  'alter collation',
  'alter conversion',
  'alter database',
  'alter domain',
  'alter foreign table',
  'alter group',
  'alter language',
  'alter large object',
  'alter operator class',
  'alter operator family',
  'alter policy',
  'alter publication',
  'alter role',
  'alter routine',
  'alter server',
  'alter statistics',
  'alter subscription',
  'alter tablespace',
  'alter text search configuration',
  'alter text search dictionary',
  'alter text search parser',
  'alter text search template',
  'alter trigger',
  'alter user mapping',
  'create database',
  'drop database',
  'create role',
  'drop role',
  'create user',
  'drop user',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'release',
]);

/** Statement types explicitly allowed */
const ALLOWED_STATEMENT_TYPES = new Set([
  'select',
  'with',
  'with recursive',
  'show',
  'explain',
  'values',
]);

/** Dangerous keywords checked even inside allowed statements (e.g. SELECT INTO) */
const DANGEROUS_KEYWORDS = [
  /\bINTO\s+(?:TEMP|TEMPORARY|TABLE|OUTFILE)\b/i,
  /\bFOR\s+UPDATE\b/i,
  /\bFOR\s+SHARE\b/i,
  /\bFOR\s+NO\s+KEY\s+UPDATE\b/i,
  /\bFOR\s+KEY\s+SHARE\b/i,
  /\bpg_sleep\s*\(/i,
  /\bpg_terminate_backend\s*\(/i,
  /\bpg_cancel_backend\s*\(/i,
  /\bpg_reload_conf\s*\(/i,
  /\blo_import\s*\(/i,
  /\blo_export\s*\(/i,
  /\bpg_read_file\s*\(/i,
  /\bpg_write_file\s*\(/i,
  /\bdblink_/i,
  /\bcopy\s+/i,
];

type BindableStatement = Statement & { type: string };

function validateBindable(stmt: BindableStatement): void {
  const type = stmt.type;

  if (BLOCKED_STATEMENT_TYPES.has(type)) {
    throw new QueryRejectedError(
      `Blocked statement type: ${type.toUpperCase()}`,
      'destructive_or_modifying'
    );
  }

  if (type === 'with' || type === 'with recursive') {
    validateWithStatement(stmt);
    return;
  }

  if (!ALLOWED_STATEMENT_TYPES.has(type)) {
    throw new QueryRejectedError(
      `Statement type not permitted: ${type}`,
      'unknown_statement_type'
    );
  }
}

function validateWithStatement(stmt: BindableStatement): void {
  if (stmt.type === 'with') {
    const withStmt = stmt as {
      bind: { statement: BindableStatement }[];
      in: BindableStatement;
    };
    for (const bound of withStmt.bind) {
      validateBindable(bound.statement);
    }
    validateBindable(withStmt.in);
    return;
  }

  const recursiveStmt = stmt as {
    bind: BindableStatement;
    in: BindableStatement;
  };
  validateBindable(recursiveStmt.bind);
  validateBindable(recursiveStmt.in);
}

function validateStatement(stmt: Statement): void {
  validateBindable(stmt as BindableStatement);
}

/**
 * Hard-reject any query that is not strictly read-only.
 * Only SELECT, WITH (read-only CTEs), EXPLAIN, SHOW, and VALUES are allowed.
 */
export function validateReadOnlyQuery(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new QueryRejectedError('Empty query', 'empty_query');
  }

  for (const pattern of DANGEROUS_KEYWORDS) {
    if (pattern.test(trimmed)) {
      throw new QueryRejectedError(
        'Query contains a blocked keyword or pattern',
        'dangerous_keyword'
      );
    }
  }

  // EXPLAIN / SHOW are read-only but may not parse via the AST parser
  const explainMatch = trimmed.match(/^\s*EXPLAIN\b(?:\s+\(.*?\))?\s+([\s\S]+)/i);
  if (explainMatch) {
    validateReadOnlyQuery(explainMatch[1]);
    return;
  }

  if (/^\s*SHOW\b/i.test(trimmed)) {
    return;
  }

  let statements: Statement[];
  try {
    statements = parse(trimmed, { locationTracking: false });
  } catch (err) {
    throw new QueryRejectedError(
      `SQL parse error: ${err instanceof Error ? err.message : String(err)}`,
      'parse_error'
    );
  }

  if (statements.length === 0) {
    throw new QueryRejectedError('No SQL statements found', 'empty_query');
  }

  for (const stmt of statements) {
    validateStatement(stmt);
  }
}

/**
 * Sanitize query results / errors so connection strings never leak.
 */
export function sanitizeOutput(text: string, connectionString?: string): string {
  let result = text;

  if (connectionString) {
    const escaped = connectionString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), '[REDACTED]');
  }

  // Redact common connection string patterns
  result = result.replace(
    /postgres(?:ql)?:\/\/[^\s'"]+/gi,
    'postgresql://[REDACTED]'
  );
  result = result.replace(
    /password\s*=\s*[^\s;&'"]+/gi,
    'password=[REDACTED]'
  );

  return result;
}
