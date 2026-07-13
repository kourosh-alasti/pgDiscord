import assert from "node:assert/strict";
import { FieldDef, QueryResult } from "pg";
import { formatQueryResult } from "../src/utils/format";

function result(columns: string[], rows: Record<string, unknown>[]): QueryResult {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: columns.map((name) => ({ name }) as FieldDef),
    rows,
  };
}

const wideResult = result(
  ["first_name", "lastname", "image", "color", "id", "embed"],
  Array.from({ length: 50 }, (_, id) => ({
    first_name: `person-${id}`,
    lastname: "a-long-last-name",
    image: "/9j/4AAQSkZJRgABAQ".repeat(20),
    color: "#ffffff",
    id,
    embed: `[${Array.from({ length: 20 }, () => "-0.030683376").join(",")}]`,
  })),
);

const formattedWideResult = formatQueryResult(wideResult);
const tableLines = formattedWideResult.split("\n").slice(1, -2);

assert.ok(tableLines.every((line) => line.length <= 108));
assert.ok(formattedWideResult.length <= 1900);
assert.equal(formattedWideResult.match(/```/g)?.length, 2);
assert.match(formattedWideResult, /…/);
assert.match(formattedWideResult, /Showing \d+ of 50 rows/);

const unsafeCell = formatQueryResult(
  result(["value"], [{ value: "line one\nline two```line three" }]),
);
assert.doesNotMatch(unsafeCell, /line one\nline two/);
assert.equal(unsafeCell.match(/```/g)?.length, 2);

const manyColumns = Array.from({ length: 15 }, (_, i) => `column_${i}`);
const formattedManyColumns = formatQueryResult(
  result(manyColumns, [Object.fromEntries(manyColumns.map((name) => [name, name]))]),
);
assert.match(formattedManyColumns, /showing first 12 of 15 columns/);

console.log("Format tests passed.");
