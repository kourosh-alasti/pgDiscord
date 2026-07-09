import { SchemaInfo } from '../schema/introspector';

export interface NlpResult {
  sql: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
}

function resolveTableName(input: string, schema: SchemaInfo): string | null {
  const normalized = input.toLowerCase().trim();

  for (const table of schema.tables) {
    const full = `${table.schema}.${table.name}`.toLowerCase();
    if (full === normalized || table.name.toLowerCase() === normalized) {
      return `${table.schema}.${table.name}`;
    }
  }

  const matches = schema.tables.filter((t) =>
    t.name.toLowerCase().includes(normalized)
  );
  if (matches.length === 1) {
    return `${matches[0].schema}.${matches[0].name}`;
  }

  return null;
}

function quoteIdent(name: string): string {
  const parts = name.split('.');
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join('.');
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Pattern-based NLP interpreter that maps natural language to read-only SQL.
 * Uses schema context for table/column resolution.
 */
export function interpretNaturalLanguage(
  input: string,
  schema: SchemaInfo
): NlpResult | null {
  const text = input.trim();
  const lower = text.toLowerCase();

  // List all tables
  if (
    /^(?:list|show|get|display|what are)(?:\s+all)?(?:\s+the)?\s+tables?/i.test(
      lower
    ) ||
    /^what tables(?:\s+are)?(?:\s+in)?(?:\s+the)?\s+database/i.test(lower)
  ) {
    return {
      sql: `SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name`,
      explanation: 'Listing all user tables in the database.',
      confidence: 'high',
    };
  }

  // Describe / schema of a table
  const describeMatch = lower.match(
    /(?:describe|show(?:\s+me)?(?:\s+the)?\s+(?:schema|structure|columns)(?:\s+of)?|what(?:'s| is)(?:\s+the)?\s+(?:schema|structure)(?:\s+of)?|columns(?:\s+in|(?:\s+of)?))\s+(?:the\s+)?(?:table\s+)?["']?(\w+)["']?/i
  );
  if (describeMatch) {
    const tableName = resolveTableName(describeMatch[1], schema);
    if (!tableName) {
      return {
        sql: '',
        explanation: `Could not find table matching "${describeMatch[1]}". Use /schema to list tables.`,
        confidence: 'low',
      };
    }
    const [schemaName, name] = tableName.split('.');
    return {
      sql: `SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '${escapeSqlLiteral(schemaName)}' AND table_name = '${escapeSqlLiteral(name)}'
ORDER BY ordinal_position`,
      explanation: `Showing column definitions for table ${tableName}.`,
      confidence: 'high',
    };
  }

  // Count rows
  const countMatch = lower.match(
    /(?:how many|count|number of)\s+(?:rows|records|entries)(?:\s+in|\s+(?:does|do))\s+(?:the\s+)?(?:table\s+)?["']?(\w+)["']?/i
  );
  if (countMatch) {
    const tableName = resolveTableName(countMatch[1], schema);
    if (!tableName) {
      return {
        sql: '',
        explanation: `Could not find table matching "${countMatch[1]}".`,
        confidence: 'low',
      };
    }
    return {
      sql: `SELECT COUNT(*) AS row_count FROM ${quoteIdent(tableName)}`,
      explanation: `Counting rows in ${tableName}.`,
      confidence: 'high',
    };
  }

  // Select top N / first N rows
  const topMatch = lower.match(
    /(?:show|get|select|display|fetch|give me)\s+(?:the\s+)?(?:top|first)\s+(\d+)\s+(?:rows|records)(?:\s+from|\s+in)?\s+(?:the\s+)?(?:table\s+)?["']?(\w+)["']?/i
  );
  if (topMatch) {
    const limit = Math.min(parseInt(topMatch[1], 10), 1000);
    const tableName = resolveTableName(topMatch[2], schema);
    if (!tableName) {
      return {
        sql: '',
        explanation: `Could not find table matching "${topMatch[2]}".`,
        confidence: 'low',
      };
    }
    return {
      sql: `SELECT * FROM ${quoteIdent(tableName)} LIMIT ${limit}`,
      explanation: `Fetching first ${limit} rows from ${tableName}.`,
      confidence: 'high',
    };
  }

  // Select all from table
  const selectAllMatch = lower.match(
    /(?:show|get|select|display|fetch|give me)\s+(?:all\s+)?(?:rows|records|data)?(?:\s+from|\s+in)\s+(?:the\s+)?(?:table\s+)?["']?(\w+)["']?/i
  );
  if (selectAllMatch) {
    const tableName = resolveTableName(selectAllMatch[1], schema);
    if (!tableName) {
      return {
        sql: '',
        explanation: `Could not find table matching "${selectAllMatch[1]}".`,
        confidence: 'low',
      };
    }
    return {
      sql: `SELECT * FROM ${quoteIdent(tableName)} LIMIT 100`,
      explanation: `Fetching up to 100 rows from ${tableName}.`,
      confidence: 'medium',
    };
  }

  // Foreign keys for a table
  const fkMatch = lower.match(
    /(?:foreign\s+keys?|relationships?|references?)(?:\s+(?:for|of|in))?\s+(?:the\s+)?(?:table\s+)?["']?(\w+)["']?/i
  );
  if (fkMatch) {
    const tableName = resolveTableName(fkMatch[1], schema);
    if (!tableName) {
      return {
        sql: '',
        explanation: `Could not find table matching "${fkMatch[1]}".`,
        confidence: 'low',
      };
    }
    const [schemaName, name] = tableName.split('.');
    return {
      sql: `SELECT
  tc.constraint_name,
  kcu.column_name AS source_column,
  ccu.table_schema AS target_schema,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = '${escapeSqlLiteral(schemaName)}'
  AND tc.table_name = '${escapeSqlLiteral(name)}'`,
      explanation: `Showing foreign key relationships for ${tableName}.`,
      confidence: 'high',
    };
  }

  // Indexes on a table
  const indexMatch = lower.match(
    /(?:indexes?|indices)(?:\s+(?:on|for|of))?\s+(?:the\s+)?(?:table\s+)?["']?(\w+)["']?/i
  );
  if (indexMatch) {
    const tableName = resolveTableName(indexMatch[1], schema);
    if (!tableName) {
      return {
        sql: '',
        explanation: `Could not find table matching "${indexMatch[1]}".`,
        confidence: 'low',
      };
    }
    const [schemaName, name] = tableName.split('.');
    return {
      sql: `SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = '${escapeSqlLiteral(schemaName)}' AND tablename = '${escapeSqlLiteral(name)}'`,
      explanation: `Listing indexes on ${tableName}.`,
      confidence: 'high',
    };
  }

  // If input looks like raw SQL, pass through (will be validated by safety filter)
  if (/^\s*(select|with|explain|show|values)\b/i.test(text)) {
    return {
      sql: text,
      explanation: 'Detected SQL query syntax — passing through read-only validator.',
      confidence: 'high',
    };
  }

  return null;
}
