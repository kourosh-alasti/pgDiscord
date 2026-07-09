import { QueryResult } from 'pg';

const MAX_CELL_LENGTH = 80;
const MAX_ROWS = 50;
const MAX_MESSAGE_LENGTH = 1900;

export function formatQueryResult(result: QueryResult): string {
  if (result.rows.length === 0) {
    return `_No rows returned._ (${result.rowCount ?? 0} rows, ${result.fields.length} columns)`;
  }

  const rows = result.rows.slice(0, MAX_ROWS);
  const columns = result.fields.map((f) => f.name);

  const colWidths = columns.map((col) => {
    const values = rows.map((r) => stringifyCell(r[col]));
    return Math.min(
      MAX_CELL_LENGTH,
      Math.max(col.length, ...values.map((v) => v.length), 3)
    );
  });

  const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-');
  const header = columns
    .map((col, i) => col.slice(0, colWidths[i]).padEnd(colWidths[i]))
    .join(' | ');

  const body = rows
    .map((row) =>
      columns
        .map((col, i) =>
          stringifyCell(row[col])
            .slice(0, colWidths[i])
            .padEnd(colWidths[i])
        )
        .join(' | ')
    )
    .join('\n');

  let output = `\`\`\`\n${header}\n${separator}\n${body}\n\`\`\``;

  const totalRows = result.rowCount ?? result.rows.length;
  if (totalRows > MAX_ROWS) {
    output += `\n_Showing ${MAX_ROWS} of ${totalRows} rows._`;
  } else {
    output += `\n_${totalRows} row(s) returned._`;
  }

  if (output.length > MAX_MESSAGE_LENGTH) {
    return output.slice(0, MAX_MESSAGE_LENGTH - 20) + '\n...```\n_Truncated._';
  }

  return output;
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function truncateText(text: string, maxLength = MAX_MESSAGE_LENGTH): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 20) + '\n\n_...truncated._';
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
