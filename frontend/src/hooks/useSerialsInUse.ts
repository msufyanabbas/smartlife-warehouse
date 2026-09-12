import { useMemo } from 'react';
import { useAssignmentForms, useRtnList } from './useApi';
import { splitSerials } from '../components/documents/lineRows';

interface AsnLine { itemCode?: string; serialNumber?: string | string[] }
interface AsnDoc {
  id: string; assignmentNo: string; status: string; createdAt?: string;
  assignedTo?: { firstName?: string; lastName?: string };
  items?: AsnLine[];
}

interface RtnLine { itemCode?: string; serialNumbers?: string | string[] }
interface RtnDoc { status: string; items?: RtnLine[] }

/** Who is holding one serial, and on which document. */
export interface SerialHolder {
  serial: string;
  formNo: string;
  holder: string;
}

/**
 * A serial only identifies a unit within its own item — a bare "1" or "N/A"
 * typed against two different SKUs is two different units, not a double-booking
 * — so serials are tracked per item code, the same way the server does it.
 */
const keyOf = (itemCode: string | undefined, serial: string) =>
  `${(itemCode ?? '').trim().toLowerCase()}::${serial.trim().toLowerCase()}`;

const nameOf = (user?: { firstName?: string; lastName?: string }) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();

/**
 * The serials that are out with a worker right now, keyed by item + serial.
 *
 * Derived from the documents, which is where serials actually live: issuing an
 * assignment form puts its serials into someone's hands and approving an RTN
 * brings them back. The two are netted as counts rather than flags, because the
 * same serial goes out again after each return — reissuing a tool has to stay
 * possible, or its first hand-out would be its last.
 *
 * Mirrors `assertSerialsAvailable` on the server, so the form can say what is
 * wrong while it is being filled in instead of only on the failed save.
 */
export function useSerialsInUse(excludeFormId?: string) {
  const { data: forms = [] } = useAssignmentForms();
  const { data: returns = [] } = useRtnList();

  const serialsOut = useMemo(() => {
    const returned = new Map<string, number>();
    for (const doc of returns as RtnDoc[]) {
      // Only an approved return has actually come back off the worker.
      if (doc.status !== 'approved') continue;
      for (const line of doc.items ?? []) {
        for (const serial of splitSerials(line.serialNumbers)) {
          const key = keyOf(line.itemCode, serial);
          returned.set(key, (returned.get(key) ?? 0) + 1);
        }
      }
    }

    const out = new Map<string, SerialHolder>();
    // Oldest first, so a return cancels the hand-out it actually followed and
    // the document reported back is the one holding the unit now.
    const issued = (forms as AsnDoc[])
      .filter(form => form.status === 'issued' && form.id !== excludeFormId)
      .slice()
      .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));

    for (const form of issued) {
      for (const line of form.items ?? []) {
        for (const serial of splitSerials(line.serialNumber)) {
          const key = keyOf(line.itemCode, serial);
          const pending = returned.get(key) ?? 0;
          if (pending > 0) {
            returned.set(key, pending - 1);
            out.delete(key);
            continue;
          }
          out.set(key, {
            serial,
            formNo: form.assignmentNo,
            holder: nameOf(form.assignedTo) || 'another worker',
          });
        }
      }
    }
    return out;
  }, [forms, returns, excludeFormId]);

  /** What is wrong with a line's serials, phrased for the cell under them. */
  const serialWarning = useMemo(
    () => (itemCode: string | undefined, value: string | string[] | undefined) => {
      const clashes = splitSerials(value)
        .map(serial => serialsOut.get(keyOf(itemCode, serial)))
        .filter(Boolean) as SerialHolder[];
      if (!clashes.length) return undefined;
      return clashes
        .map(clash => `${clash.serial} is out with ${clash.holder} on ${clash.formNo}`)
        .join('; ');
    },
    [serialsOut],
  );

  return { serialsOut, serialWarning };
}
