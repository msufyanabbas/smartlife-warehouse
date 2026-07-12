/**
 * A line item covers one or more units, so its serials arrive either as a single
 * string ("one serial for the whole line") or as one entry per unit. Both shapes
 * collapse to the same comma-separated string, which is what every consumer —
 * the inventory row, the printed document, the Excel exports — already reads.
 */
export function joinSerials(value?: string | string[] | null): string {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(',');
  return parts
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}
