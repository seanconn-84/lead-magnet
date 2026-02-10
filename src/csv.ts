/**
 * Lightweight CSV reader/writer for batch username processing.
 *
 * Reads CSV files and extracts usernames from a configurable column.
 * Writes validation results back to CSV.
 */

import fs from "node:fs";
import path from "node:path";

export interface CsvRow {
  /** Original row index (0-based, excluding header) */
  index: number;
  /** The username value extracted from this row */
  username: string;
  /** All columns from the original row, keyed by header name */
  columns: Record<string, string>;
}

export interface CsvReadOptions {
  /** Column name or 0-based index containing usernames (default: auto-detect) */
  column?: string | number;
  /** CSV delimiter (default: auto-detect comma, semicolon, or tab) */
  delimiter?: string;
  /** Skip rows where the username cell is empty */
  skipEmpty?: boolean;
}

const USERNAME_COLUMN_HINTS = [
  "username",
  "user",
  "telegram",
  "handle",
  "tg",
  "tg_username",
  "telegram_username",
  "screen_name",
  "account",
  "name",
];

function detectDelimiter(line: string): string {
  const commas = (line.match(/,/g) || []).length;
  const semicolons = (line.match(/;/g) || []).length;
  const tabs = (line.match(/\t/g) || []).length;

  if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
  if (semicolons > commas && semicolons > 0) return ";";
  return ",";
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function detectUsernameColumn(headers: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));

  for (const hint of USERNAME_COLUMN_HINTS) {
    const idx = lower.indexOf(hint);
    if (idx !== -1) return idx;
  }

  // Fallback: partial match
  for (const hint of USERNAME_COLUMN_HINTS) {
    const idx = lower.findIndex((h) => h.includes(hint));
    if (idx !== -1) return idx;
  }

  // Last resort: first column
  return 0;
}

/**
 * Reads a CSV file and extracts usernames from it.
 */
export function readCsv(filePath: string, options?: CsvReadOptions): CsvRow[] {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return [];
  }

  const delimiter = options?.delimiter ?? detectDelimiter(lines[0]);
  const headerFields = parseCsvLine(lines[0], delimiter);

  // Determine which column holds usernames
  let colIndex: number;
  if (options?.column !== undefined) {
    if (typeof options.column === "number") {
      colIndex = options.column;
    } else {
      const idx = headerFields.findIndex(
        (h) => h.toLowerCase() === options.column!.toString().toLowerCase()
      );
      colIndex = idx !== -1 ? idx : 0;
    }
  } else {
    colIndex = detectUsernameColumn(headerFields);
  }

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter);
    const username = (fields[colIndex] || "").replace(/^@/, "").trim();

    if (!username && options?.skipEmpty !== false) continue;

    const columns: Record<string, string> = {};
    headerFields.forEach((header, idx) => {
      columns[header] = fields[idx] || "";
    });

    rows.push({ index: i - 1, username, columns });
  }

  return rows;
}

/**
 * Writes validation results to a CSV file.
 * Merges results back with original columns if provided.
 */
export function writeCsv(
  outputPath: string,
  results: Array<{
    username: string;
    exists: boolean;
    displayName?: string;
    description?: string;
    profileType?: string;
    error?: string;
    originalColumns?: Record<string, string>;
  }>
): void {
  const hasOriginal = results.some((r) => r.originalColumns);
  const originalHeaders = hasOriginal
    ? Object.keys(results.find((r) => r.originalColumns)!.originalColumns!)
    : [];

  const resultHeaders = [
    "username",
    "exists",
    "profile_type",
    "display_name",
    "description",
    "error",
  ];

  const allHeaders = [...new Set([...originalHeaders, ...resultHeaders])];

  const lines: string[] = [allHeaders.join(",")];

  for (const r of results) {
    const row = allHeaders.map((h) => {
      let value: string;
      switch (h) {
        case "username":
          value = r.username;
          break;
        case "exists":
          value = r.exists ? "true" : "false";
          break;
        case "profile_type":
          value = r.profileType || "";
          break;
        case "display_name":
          value = r.displayName || "";
          break;
        case "description":
          value = r.description || "";
          break;
        case "error":
          value = r.error || "";
          break;
        default:
          value = r.originalColumns?.[h] || "";
      }
      // Escape fields containing commas or quotes
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    lines.push(row.join(","));
  }

  const resolved = path.resolve(outputPath);
  fs.writeFileSync(resolved, lines.join("\n") + "\n", "utf-8");
}

/**
 * Formats validation results as a CSV string (for stdout).
 */
export function formatCsv(
  results: Array<{
    username: string;
    exists: boolean;
    displayName?: string;
    profileType?: string;
    error?: string;
  }>
): string {
  const lines = ["username,exists,profile_type,display_name,error"];
  for (const r of results) {
    const fields = [
      r.username,
      r.exists ? "true" : "false",
      r.profileType || "",
      r.displayName || "",
      r.error || "",
    ].map((f) => {
      if (f.includes(",") || f.includes('"') || f.includes("\n")) {
        return `"${f.replace(/"/g, '""')}"`;
      }
      return f;
    });
    lines.push(fields.join(","));
  }
  return lines.join("\n");
}
