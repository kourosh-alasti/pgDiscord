import { SchemaInfo, TableInfo } from './introspector';

function mermaidSafe(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function tableNodeId(table: TableInfo): string {
  return mermaidSafe(`${table.schema}_${table.name}`);
}

function formatColumnLine(col: {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}): string {
  const markers: string[] = [];
  if (col.isPrimaryKey) markers.push('PK');
  if (col.isForeignKey) markers.push('FK');
  const suffix = markers.length > 0 ? ` ${markers.join(',')}` : '';
  return `    ${col.dataType} ${col.name}${suffix}`;
}

export function schemaToMermaid(schema: SchemaInfo, tableFilter?: string): string {
  let tables = schema.tables;
  if (tableFilter) {
    const filter = tableFilter.toLowerCase();
    tables = tables.filter(
      (t) =>
        t.name.toLowerCase() === filter ||
        `${t.schema}.${t.name}`.toLowerCase() === filter ||
        t.name.toLowerCase().includes(filter)
    );
  }

  if (tables.length === 0) {
    return 'erDiagram\n  EMPTY["No tables found"]';
  }

  const lines: string[] = ['erDiagram'];

  for (const table of tables) {
    const id = tableNodeId(table);
    const label = `${table.schema}.${table.name}`;
    lines.push(`  ${id} {`);
    for (const col of table.columns) {
      lines.push(formatColumnLine(col));
    }
    lines.push('  }');
    lines.push(`  %% ${label}`);
  }

  const tableSet = new Set(tables.map((t) => `${t.schema}.${t.name}`));

  for (const fk of schema.foreignKeys) {
    const sourceKey = `${fk.sourceSchema}.${fk.sourceTable}`;
    const targetKey = `${fk.targetSchema}.${fk.targetTable}`;
    if (!tableSet.has(sourceKey) || !tableSet.has(targetKey)) continue;

    const sourceId = mermaidSafe(`${fk.sourceSchema}_${fk.sourceTable}`);
    const targetId = mermaidSafe(`${fk.targetSchema}_${fk.targetTable}`);
    lines.push(
      `  ${sourceId} }o--|| ${targetId} : "${fk.sourceColumn}"`
    );
  }

  return lines.join('\n');
}

export function schemaToAsciiDiagram(schema: SchemaInfo, tableFilter?: string): string {
  let tables = schema.tables;
  if (tableFilter) {
    const filter = tableFilter.toLowerCase();
    tables = tables.filter(
      (t) =>
        t.name.toLowerCase() === filter ||
        `${t.schema}.${t.name}`.toLowerCase() === filter
    );
  }

  const lines: string[] = ['┌─────────────────────────────────────┐'];
  lines.push('│         DATABASE SCHEMA DIAGRAM      │');
  lines.push('└─────────────────────────────────────┘');
  lines.push('');

  for (const table of tables) {
    const fullName = `${table.schema}.${table.name}`;
    const width = Math.max(fullName.length + 4, 30);
    lines.push('┌' + '─'.repeat(width) + '┐');
    lines.push(`│ ${fullName.padEnd(width - 2)} │`);
    lines.push('├' + '─'.repeat(width) + '┤');
    for (const col of table.columns) {
      const markers: string[] = [];
      if (col.isPrimaryKey) markers.push('PK');
      if (col.isForeignKey) markers.push('FK');
      const markerStr = markers.length > 0 ? ` [${markers.join(',')}]` : '';
      const colLine = `  ${col.name}: ${col.dataType}${markerStr}`;
      lines.push(`│ ${colLine.padEnd(width - 2)} │`);
    }
    lines.push('└' + '─'.repeat(width) + '┘');
    lines.push('');
  }

  const tableSet = new Set(tables.map((t) => `${t.schema}.${t.name}`));
  const relevantFks = schema.foreignKeys.filter(
    (fk) =>
      tableSet.has(`${fk.sourceSchema}.${fk.sourceTable}`) &&
      tableSet.has(`${fk.targetSchema}.${fk.targetTable}`)
  );

  if (relevantFks.length > 0) {
    lines.push('Relationships:');
    for (const fk of relevantFks) {
      lines.push(
        `  ${fk.sourceSchema}.${fk.sourceTable}.${fk.sourceColumn} ──► ${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`
      );
    }
  }

  return lines.join('\n');
}
