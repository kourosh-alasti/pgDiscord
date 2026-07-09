import { SchemaInfo, TableInfo } from './introspector';

function formatTable(table: TableInfo): string {
  const lines: string[] = [];
  const fullName = `${table.schema}.${table.name}`;

  lines.push(`### \`${fullName}\``);
  lines.push('');
  lines.push('| Column | Type | Nullable | PK | FK | Default |');
  lines.push('|--------|------|----------|----|----|---------|');

  for (const col of table.columns) {
    const pk = col.isPrimaryKey ? '✓' : '';
    const fk = col.isForeignKey ? `→ ${col.foreignKeyRef}` : '';
    const nullable = col.isNullable ? 'YES' : 'NO';
    const defaultVal = col.defaultValue ?? '';
    lines.push(
      `| \`${col.name}\` | ${col.dataType} | ${nullable} | ${pk} | ${fk} | ${defaultVal} |`
    );
  }

  return lines.join('\n');
}

export function schemaToMarkdown(schema: SchemaInfo, tableFilter?: string): string {
  const lines: string[] = ['# Database Schema', ''];

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
    return '# Database Schema\n\n_No tables found matching the filter._';
  }

  lines.push(`**Tables:** ${tables.length}`);
  lines.push('');

  for (const table of tables) {
    lines.push(formatTable(table));
    lines.push('');
  }

  const relevantFks = schema.foreignKeys.filter((fk) =>
    tables.some(
      (t) =>
        (t.schema === fk.sourceSchema && t.name === fk.sourceTable) ||
        (t.schema === fk.targetSchema && t.name === fk.targetTable)
    )
  );

  if (relevantFks.length > 0) {
    lines.push('## Foreign Key Relationships');
    lines.push('');
    for (const fk of relevantFks) {
      lines.push(
        `- \`${fk.sourceSchema}.${fk.sourceTable}.${fk.sourceColumn}\` → \`${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}\` (${fk.constraintName})`
      );
    }
  }

  return lines.join('\n');
}

export function schemaToAgentMarkdown(schema: SchemaInfo): string {
  const lines: string[] = [
    '```yaml',
    'database_schema:',
    `  table_count: ${schema.tables.length}`,
    '  tables:',
  ];

  for (const table of schema.tables) {
    const fullName = `${table.schema}.${table.name}`;
    lines.push(`    - name: ${fullName}`);
    lines.push('      columns:');
    for (const col of table.columns) {
      const attrs: string[] = [`type=${col.dataType}`];
      if (col.isPrimaryKey) attrs.push('pk');
      if (col.isForeignKey) attrs.push(`fk=${col.foreignKeyRef}`);
      if (!col.isNullable) attrs.push('not_null');
      lines.push(`        - ${col.name}: { ${attrs.join(', ')} }`);
    }
  }

  if (schema.foreignKeys.length > 0) {
    lines.push('  foreign_keys:');
    for (const fk of schema.foreignKeys) {
      lines.push(
        `    - ${fk.sourceSchema}.${fk.sourceTable}.${fk.sourceColumn} -> ${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`
      );
    }
  }

  lines.push('```');
  return lines.join('\n');
}
