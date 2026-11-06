/**
 * Render a text table with aligned columns using a " | " separator.
 *
 * ponytail: aligned-table formatting was flagged as over-engineered for LLM
 * consumers (ponytail audit, issue #149). Path B (shared utility) chosen over
 * Path A (simplify to key:value). Revisit if table maintenance cost exceeds benefit.
 *
 * @param {string[]} headers - Column header labels.
 * @param {Array<Array<string|number>>} rows - Table data, one sub-array per row.
 * @returns {string} Formatted table string, or empty string if rows is empty.
 */
export function renderTable(headers, rows) {
  if (rows.length === 0) return "";

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
  );

  const line = widths.map((w) => "-".repeat(w)).join(" | ");
  const head = headers.map((h, i) => h.padEnd(widths[i])).join(" | ");
  const body = rows.map((row) =>
    row.map((cell, i) => String(cell).padEnd(widths[i])).join(" | "),
  );

  return [head, line, ...body].join("\n");
}
