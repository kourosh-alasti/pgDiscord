import { QueryResult } from "pg";

const MAX_TABLE_WIDTH = 108;
const MAX_CELL_LENGTH = 32;
const MIN_CELL_LENGTH = 3;
const MAX_COLUMNS = 12;
const MAX_ROWS = 50;
const MAX_MESSAGE_LENGTH = 1900;

export function formatQueryResult(result: QueryResult, maxLength = MAX_MESSAGE_LENGTH): string {
  if (result.rows.length === 0) {
    return `_No rows returned._ (${result.rowCount ?? 0} rows, ${result.fields.length} columns)`;
  }

  const rows = result.rows.slice(0, MAX_ROWS);
  const allColumns = result.fields.map((f) => f.name);
  const columns = allColumns.slice(0, MAX_COLUMNS);

  const desiredWidths = columns.map((col) => {
    const values = rows.map((r) => stringifyCell(r[col]));
    return Math.min(
      MAX_CELL_LENGTH,
      Math.max(col.length, ...values.map((v) => v.length), MIN_CELL_LENGTH),
    );
  });
  const colWidths = fitColumnWidths(desiredWidths, columns.length);

  const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");
  const header = columns.map((col, i) => formatCell(col, colWidths[i])).join(" | ");

  const totalRows = result.rowCount ?? result.rows.length;
  const formattedRows: string[] = [];

  for (const row of rows) {
    const formattedRow = columns
      .map((col, i) => formatCell(stringifyCell(row[col]), colWidths[i]))
      .join(" | ");
    const candidateRows = [...formattedRows, formattedRow];
    const candidate = buildTableOutput(
      header,
      separator,
      candidateRows,
      totalRows,
      allColumns.length,
    );

    if (candidate.length > maxLength) break;
    formattedRows.push(formattedRow);
  }

  return buildTableOutput(header, separator, formattedRows, totalRows, allColumns.length);
}

function fitColumnWidths(desiredWidths: number[], columnCount: number): number[] {
  const separatorWidth = Math.max(0, columnCount - 1) * 3;
  const availableWidth = MAX_TABLE_WIDTH - separatorWidth;
  const widths = [...desiredWidths];

  while (widths.reduce((sum, width) => sum + width, 0) > availableWidth) {
    let widestIndex = -1;
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] > MIN_CELL_LENGTH && (widestIndex === -1 || widths[i] > widths[widestIndex])) {
        widestIndex = i;
      }
    }

    if (widestIndex === -1) break;
    widths[widestIndex]--;
  }

  return widths;
}

function formatCell(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width);
  if (width === 1) return "…";
  return `${value.slice(0, width - 1)}…`;
}

function buildTableOutput(
  header: string,
  separator: string,
  rows: string[],
  totalRows: number,
  totalColumns: number,
): string {
  const lines = ["```", header, separator, ...rows, "```"];
  const notes: string[] = [];

  if (rows.length < totalRows) {
    notes.push(`Showing ${rows.length} of ${totalRows} rows`);
  } else {
    notes.push(`${totalRows} row(s) returned`);
  }
  if (totalColumns > MAX_COLUMNS) {
    notes.push(`showing first ${MAX_COLUMNS} of ${totalColumns} columns`);
  }

  return `${lines.join("\n")}\n_${notes.join("; ")}._`;
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  let text: string;

  if (typeof value === "object") {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }

  return text
    .replace(/\r\n|\r|\n/g, "↵")
    .replace(/\t/g, "⇥")
    .replace(/```/g, "ˋˋˋ");
}

export function truncateText(text: string, maxLength = MAX_MESSAGE_LENGTH): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 20) + "\n\n_...truncated._";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
