import { useMemo } from 'react';
import { useGrnList, useAssignmentForms } from './useApi';

interface GrnLine { itemCode?: string; receivedQty?: number }
interface GrnDoc { status: string; items?: GrnLine[] }

interface AsnLine { itemCode?: string; qtyIssued?: number }
interface AsnDoc { status: string; items?: AsnLine[] }

interface StockLike { sku?: string; availableQuantity: number }

/**
 * On-hand stock per SKU, derived from the documents rather than read off the
 * inventory row: everything completed GRNs receipted, less everything issued
 * ASN forms handed out.
 *
 * This is the same figure the Stock Report's Closing column shows, so the two
 * screens agree by construction instead of by coincidence.
 *
 * Two things it does not see, both of which make it read low:
 *
 * - Returns. Handing stock back adjusts inventory but never writes back to the
 *   ASN that issued it, so `qtyIssued` is cumulative-ever-issued. Stock issued,
 *   returned and reshelved still counts as gone.
 * - Stock added outside a GRN. `InventoryService.create()` and `bulkCreate()`
 *   both add quantity with no document behind it. A SKU with no GRN line at all
 *   is absent from this map and falls back to the inventory row, but a SKU with
 *   GRN history *plus* a manual top-up resolves here and the top-up is invisible.
 *
 * Because it gates issuing, prefer `resolveStock` below over reading the map
 * directly — it keeps the fallback consistent everywhere.
 */
export function useDocumentStock() {
  const { data: grnData = [] } = useGrnList();
  const { data: assignmentFormsData = [] } = useAssignmentForms();

  const availableBySku = useMemo(() => {
    const map = new Map<string, number>();

    for (const grn of grnData as GrnDoc[]) {
      // Drafts have not entered stock yet.
      if (grn.status !== 'completed') continue;
      for (const line of grn.items ?? []) {
        if (!line.itemCode?.trim() || !line.receivedQty) continue;
        const sku = line.itemCode.trim().toLowerCase();
        map.set(sku, (map.get(sku) ?? 0) + line.receivedQty);
      }
    }

    for (const form of assignmentFormsData as AsnDoc[]) {
      // Only an issued form has moved anything; approved is still a request.
      if (form.status !== 'issued') continue;
      for (const line of form.items ?? []) {
        if (!line.itemCode?.trim() || !line.qtyIssued) continue;
        const sku = line.itemCode.trim().toLowerCase();
        map.set(sku, (map.get(sku) ?? 0) - line.qtyIssued);
      }
    }

    for (const [sku, qty] of map) map.set(sku, Math.max(0, qty));
    return map;
  }, [grnData, assignmentFormsData]);

  /** Document-derived stock for an item, falling back to its row when no GRN names its SKU. */
  const resolveStock = useMemo(
    () => (item: StockLike) =>
      availableBySku.get(item.sku?.trim().toLowerCase() ?? '') ?? item.availableQuantity,
    [availableBySku],
  );

  return { availableBySku, resolveStock };
}
