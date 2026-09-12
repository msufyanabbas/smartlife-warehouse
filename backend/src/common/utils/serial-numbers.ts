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

/**
 * The counterpart to `joinSerials`: reads either shape back as one entry per
 * serial, so callers can reason about the units a line covers individually.
 */
export function splitSerials(value?: string | string[] | null): string[] {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(',');
  return parts.map(part => String(part ?? '').trim()).filter(Boolean);
}

/**
 * A serial only identifies a unit within its own item — a bare "1" or "N/A"
 * typed against two different SKUs is two different units, not a double-booking
 * — so everything that tracks a serial keys it by item code as well.
 */
export function serialKey(itemCode: string | undefined, serial: string): string {
  return `${(itemCode ?? '').trim().toLowerCase()}::${serial.trim().toLowerCase()}`;
}
