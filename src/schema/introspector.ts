import { PoolClient } from "pg";

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyRef: string | null;
}

export interface TableInfo {
  schema: string;
  name: string;
  columns: ColumnInfo[];
}

export interface ForeignKeyInfo {
  constraintName: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumn: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
}

export interface SchemaInfo {
  tables: TableInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export async function introspectSchema(client: PoolClient): Promise<SchemaInfo> {
  const tablesResult = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON c.table_schema = t.table_schema
      AND c.table_name = t.table_name
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `);

  const pkResult = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(`
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position
  `);

  const fkResult = await client.query<{
    constraint_name: string;
    source_schema: string;
    source_table: string;
    source_column: string;
    target_schema: string;
    target_table: string;
    target_column: string;
  }>(`
    SELECT
      tc.constraint_name,
      kcu.table_schema AS source_schema,
      kcu.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_schema AS target_schema,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.constraint_catalog = kcu.constraint_catalog
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
      AND tc.constraint_catalog = rc.constraint_catalog
    JOIN information_schema.key_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
      AND rc.unique_constraint_schema = ccu.constraint_schema
      AND rc.unique_constraint_catalog = ccu.constraint_catalog
      AND kcu.ordinal_position = ccu.ordinal_position
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY
      kcu.table_schema,
      kcu.table_name,
      tc.constraint_name,
      kcu.ordinal_position
  `);

  const pkSet = new Set(
    pkResult.rows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`),
  );

  const fkMap = new Map<string, string>();
  for (const fk of fkResult.rows) {
    const key = `${fk.source_schema}.${fk.source_table}.${fk.source_column}`;
    fkMap.set(key, `${fk.target_schema}.${fk.target_table}.${fk.target_column}`);
  }

  const tableMap = new Map<string, TableInfo>();

  for (const row of tablesResult.rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!tableMap.has(key)) {
      tableMap.set(key, {
        schema: row.table_schema,
        name: row.table_name,
        columns: [],
      });
    }

    const colKey = `${row.table_schema}.${row.table_name}.${row.column_name}`;
    tableMap.get(key)!.columns.push({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === "YES",
      defaultValue: row.column_default,
      isPrimaryKey: pkSet.has(colKey),
      isForeignKey: fkMap.has(colKey),
      foreignKeyRef: fkMap.get(colKey) ?? null,
    });
  }

  const foreignKeys: ForeignKeyInfo[] = fkResult.rows.map((fk) => ({
    constraintName: fk.constraint_name,
    sourceSchema: fk.source_schema,
    sourceTable: fk.source_table,
    sourceColumn: fk.source_column,
    targetSchema: fk.target_schema,
    targetTable: fk.target_table,
    targetColumn: fk.target_column,
  }));

  return {
    tables: Array.from(tableMap.values()),
    foreignKeys,
  };
}

export async function getTableNames(client: PoolClient, schema?: string): Promise<string[]> {
  const result = await client.query<{ full_name: string }>(
    `
    SELECT table_schema || '.' || table_name AS full_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_type = 'BASE TABLE'
      ${schema ? "AND table_schema = $1" : ""}
    ORDER BY table_schema, table_name
    `,
    schema ? [schema] : [],
  );
  return result.rows.map((r) => r.full_name);
}
