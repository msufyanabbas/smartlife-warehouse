import { useState, useMemo, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart2, ClipboardCheck, Download, FileDown, Search, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  useInventory, useItemUsage, useGrnList, useAssignmentForms, useRtnList,
} from '../hooks/useApi';
import MultiSelect from '../components/MultiSelect';
import SerialNumbers from '../components/SerialNumbers';
import AssignedUsedReport from './AssignedUsedReport';
import InstallationsReport from './InstallationsReport';

/**
 * Only the identifying and display fields, deliberately.
 *
 * Every number in this report is derived from the documents that recorded the
 * movement — GRNs, assignment forms, usage logs — never from the running
 * balances on the inventory row. Those balances are a live cursor: they are
 * rewritten in place by each movement, carry no history, and rows predating a
 * given piece of bookkeeping never received it, so they cannot reconstruct a
 * past period. The quantity columns are left off this interface so that reading
 * one here is a compile error rather than a silent regression.
 */
interface InventoryItem {
  id: string; name: string; sku: string; schemeNo?: string; projectName?: string;
  category?: string; serialNumber?: string;
  grnId?: string; grnNo?: string;
  receivedAt?: string; createdAt: string;
}

interface UsageRecord {
  id: string; itemId: string; quantityUsed: number;
  assignmentId?: string;
  usedAt?: string; createdAt: string;
  item?: { name: string; sku: string };
}

interface GrnLineItem {
  itemCode: string; itemDescription: string; receivedQty: number;
}

interface GrnDocument {
  id: string; grnNo: string; schemeNo?: string; status: string;
  dateOfReceipt?: string; createdAt: string;
  items?: GrnLineItem[];
}

interface AssignmentFormLine {
  itemCode?: string; qtyIssued?: number; itemId?: string;
}

interface AssignmentFormDocument {
  id: string; assignmentNo: string; status: string;
  items?: AssignmentFormLine[];
}

interface RtnLine {
  itemCode?: string; qtyReturned?: number; itemId?: string;
}

interface RtnDocumentRow {
  id: string; rtnNo: string; status: string;
  items?: RtnLine[];
}

interface StockRow {
  itemId: string;
  name: string;
  sku: string;
  serialNumber: string;
  schemeNo: string;
  grnNo: string;
  category: string;
  opening: number;
  received: number;
  assigned: number;
  issued: number;
  closing: number;
}

/**
 * `dateOfReceipt` is a DATE column, so it arrives as a bare 'YYYY-MM-DD' string.
 * `new Date()` would read that as UTC midnight and shift it a day in negative
 * offsets, so anchor it to local midnight instead. Full timestamps pass through.
 */
function parseDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
}

const matchKey = (sku?: string, schemeNo?: string) =>
  `${(sku || '').trim().toLowerCase()}|${(schemeNo || '').trim().toLowerCase()}`;

const QUICK_RANGES = [
  { label: 'This Month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'Last Month', getValue: () => ({ from: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') }) },
  { label: 'Last 3 Months', getValue: () => ({ from: format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'This Year', getValue: () => ({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` }) },
];

type ReportTab = 'movement' | 'assigned-used' | 'installations';

export default function StockReportPage() {
  const [tab, setTab] = useState<ReportTab>('movement');

  const tabButton = (value: ReportTab, label: string, icon?: ReactNode) => (
    <button
      className={`btn btn-sm ${tab === value ? 'btn-primary' : 'btn-ghost'}`}
      onClick={() => setTab(value)}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Reports</h1>
        <p>Stock movement and assigned / used item history</p>
      </div>

      <div className="flex gap-2" style={{ marginBottom: 20 }}>
        {tabButton('movement', 'Stock Movement')}
        {tabButton('assigned-used', 'Issued Items (ASN)')}
        {tabButton('installations', 'Installations', <ClipboardCheck size={13} />)}
      </div>

      {tab === 'movement' && <StockMovementReport />}
      {tab === 'assigned-used' && <AssignedUsedReport />}
      {tab === 'installations' && <InstallationsReport />}
    </div>
  );
}

function StockMovementReport() {
  const { data: items = [] } = useInventory();
  const { data: usageData = [] } = useItemUsage();
  const { data: grnData = [] } = useGrnList();
  const { data: assignmentFormsData = [] } = useAssignmentForms();
  const { data: rtnData = [] } = useRtnList();

  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [schemeFilters, setSchemeFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);

  const list = items as InventoryItem[];
  const usage = usageData as UsageRecord[];
  const grns = grnData as GrnDocument[];
  const assignmentForms = assignmentFormsData as AssignmentFormDocument[];
  const rtns = rtnData as RtnDocumentRow[];

  const schemeOptions = useMemo(() => [...new Set(list.map(i => i.schemeNo).filter(Boolean))].sort() as string[], [list]);
  const categoryOptions = useMemo(() => [...new Set(list.map(i => i.category).filter(Boolean))].sort() as string[], [list]);

  /**
   * Where a document line lands in inventory when it names a SKU but no row id.
   *
   * GRN id + SKU first: linkGrnToInventory() stamps the row it topped up with the
   * GRN's id, so that stamp is a definitive record of where the stock actually
   * went — it survives scheme edits and disambiguates duplicate SKUs, either of
   * which make the name-based lookups below land a receipt on the wrong row.
   * Then SKU + scheme, mirroring the backend's upsert, then SKU alone as a last
   * resort. (A row only remembers the *last* GRN that touched it, so earlier
   * receipts on the same row still need the name-based fallbacks.)
   */
  const itemLookup = useMemo(() => {
    const byGrnAndSku = new Map<string, string>();
    const byGrn = new Map<string, string[]>();
    const bySkuAndScheme = new Map<string, string>();
    const bySku = new Map<string, string>();
    const ids = new Set<string>();
    for (const item of list) {
      ids.add(item.id);
      if (item.grnId) {
        const grnSku = `${item.grnId}|${matchKey(item.sku)}`;
        if (!byGrnAndSku.has(grnSku)) byGrnAndSku.set(grnSku, item.id);
        const forGrn = byGrn.get(item.grnId) ?? [];
        forGrn.push(item.id);
        byGrn.set(item.grnId, forGrn);
      }
      const skuScheme = matchKey(item.sku, item.schemeNo);
      if (!bySkuAndScheme.has(skuScheme)) bySkuAndScheme.set(skuScheme, item.id);
      const sku = matchKey(item.sku);
      if (!bySku.has(sku)) bySku.set(sku, item.id);
    }
    return { byGrnAndSku, byGrn, bySkuAndScheme, bySku, ids };
  }, [list]);

  /**
   * How much stock each inventory row formally received via GRN inside the period.
   *
   * This has to come from the GRN documents themselves, not from the row's
   * quantity. An inventory row accumulates stock from several sources — manual
   * adds (which upsert onto an existing SKU) and any number of GRNs — but only
   * ever remembers the *last* GRN that touched it. Reading `totalQuantity` as
   * "received" therefore credits the whole row, pre-existing stock included, to
   * that one GRN.
   *
   * Each line lands on exactly one row, so a receipt is never counted twice.
   */
  const receiptsByItem = useMemo(() => {
    const { byGrnAndSku, byGrn, bySkuAndScheme, bySku } = itemLookup;
    const receipts = new Map<string, { date: Date; qty: number }[]>();
    for (const grn of grns) {
      // Drafts have not entered inventory yet.
      if (grn.status !== 'completed') continue;

      const date = parseDate(grn.dateOfReceipt || grn.createdAt);
      const lines = (grn.items ?? []).filter(l => l.itemCode?.trim() && l.receivedQty > 0);
      // Rows stamped as last topped-up by this GRN. When the GRN has a single
      // line and a single stamped row, they pair up with no SKU text needed —
      // covers rows whose SKU was edited after receipt, which every name-based
      // lookup would otherwise drop (inflating that row's Opening by the
      // orphaned receipt).
      const stamped = byGrn.get(grn.id) ?? [];

      for (const line of lines) {
        const itemId = byGrnAndSku.get(`${grn.id}|${matchKey(line.itemCode)}`)
          ?? (lines.length === 1 && stamped.length === 1 ? stamped[0] : undefined)
          ?? bySkuAndScheme.get(matchKey(line.itemCode, grn.schemeNo))
          ?? bySku.get(matchKey(line.itemCode));
        // A GRN whose stock was since deleted from inventory has no row to sit on.
        if (!itemId) continue;
        const forItem = receipts.get(itemId) ?? [];
        forItem.push({ date, qty: line.receivedQty });
        receipts.set(itemId, forItem);
      }
    }
    return receipts;
  }, [itemLookup, grns]);

  /**
   * How much stock each inventory row has been handed out on issued ASN forms,
   * counted across all time.
   *
   * The row's own `assignedQuantity` cannot answer this. It is a *live* balance —
   * issuing raises it, a return lowers it again — and forms issued before that
   * bookkeeping landed never raised it at all, so it under-reports what actually
   * went out. The ASN documents are the record of the hand-out itself, which no
   * later movement rewrites.
   *
   * Lines carry an `itemId`, which `assertIssuable()` requires before a form can
   * be issued, so a line normally names its row outright. Forms issued before
   * that guard existed can lack one; those fall back to their SKU, and the SKU
   * map is built *only* from such lines so a line is never counted on both paths.
   */
  const asnIssued = useMemo(() => {
    const byItemId = new Map<string, number>();
    const bySkuUnlinked = new Map<string, number>();
    for (const form of assignmentForms) {
      if (form.status !== 'issued') continue;
      for (const line of form.items ?? []) {
        const qty = line.qtyIssued ?? 0;
        if (qty <= 0) continue;
        if (line.itemId) {
          byItemId.set(line.itemId, (byItemId.get(line.itemId) ?? 0) + qty);
        } else if (line.itemCode?.trim()) {
          const sku = matchKey(line.itemCode);
          bySkuUnlinked.set(sku, (bySkuUnlinked.get(sku) ?? 0) + qty);
        }
      }
    }
    return { byItemId, bySkuUnlinked };
  }, [assignmentForms]);

  /**
   * The other half of that hand-out: what approved RTN documents brought back.
   *
   * Keyed the same two ways as `asnIssued`, and for the same reason — a line
   * normally names its inventory row outright, and one that only carries a SKU
   * falls back to the SKU map. Only approved returns count: a draft or a return
   * awaiting a manager is stock the worker still holds.
   */
  const rtnReturned = useMemo(() => {
    const byItemId = new Map<string, number>();
    const bySkuUnlinked = new Map<string, number>();
    for (const rtn of rtns) {
      if (rtn.status !== 'approved') continue;
      for (const line of rtn.items ?? []) {
        const qty = line.qtyReturned ?? 0;
        if (qty <= 0) continue;
        if (line.itemId) {
          byItemId.set(line.itemId, (byItemId.get(line.itemId) ?? 0) + qty);
        } else if (line.itemCode?.trim()) {
          const sku = matchKey(line.itemCode);
          bySkuUnlinked.set(sku, (bySkuUnlinked.get(sku) ?? 0) + qty);
        }
      }
    }
    return { byItemId, bySkuUnlinked };
  }, [rtns]);

  /** Consumption logged against each row, kept with its date so a period can be cut out of it. */
  const usageByItem = useMemo(() => {
    const byItem = new Map<string, { date: Date; qty: number }[]>();
    for (const record of usage) {
      if (!record.itemId) continue;
      const forItem = byItem.get(record.itemId) ?? [];
      forItem.push({ date: new Date(record.usedAt || record.createdAt), qty: record.quantityUsed || 0 });
      byItem.set(record.itemId, forItem);
    }
    return byItem;
  }, [usage]);

  /**
   * SKUs sitting on more than one inventory row. An unlinked ASN line names only
   * a SKU, so there is no way to tell which of those rows it came out of —
   * crediting it to each of them would report the same hand-out several times
   * over. Those rows show only what their linked lines prove.
   */
  const ambiguousSkus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of list) {
      const sku = matchKey(item.sku);
      counts.set(sku, (counts.get(sku) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([sku]) => sku));
  }, [list]);

  // Build stock report rows
  const reportRows = useMemo((): StockRow[] => {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date('2000-01-01T00:00:00');
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : new Date();

    return list
      .filter(item => {
        // Every number below is built from GRN receipts, so a row no GRN ever
        // landed on has nothing to report and is left out entirely.
        if (!receiptsByItem.has(item.id)) return false;
        const q = search.toLowerCase();
        const matchSearch = !q || item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q) || item.serialNumber?.toLowerCase().includes(q) || item.schemeNo?.toLowerCase().includes(q);
        // No selection means "every scheme", not "no scheme".
        const matchScheme = !schemeFilters.length || schemeFilters.includes(item.schemeNo || '');
        const matchCat = !categoryFilters.length || categoryFilters.includes(item.category || '');
        return matchSearch && matchScheme && matchCat;
      })
      .map(item => {
        const receipts = receiptsByItem.get(item.id) ?? [];

        // Opening — everything GRNs receipted onto this row before the period
        // opened. Read off the receipts themselves rather than reasoning
        // backwards from a present-day balance, so it does not move when stock
        // is handed out, returned or consumed after the period closes.
        const opening = receipts
          .filter(r => r.date < from)
          .reduce((s, r) => s + r.qty, 0);

        // Received — what a GRN formally receipted inside the period.
        const received = receipts
          .filter(r => r.date >= from && r.date <= to)
          .reduce((s, r) => s + r.qty, 0);

        // Assigned — every hand-out on an issued ASN less everything an approved
        // RTN brought back, across all time rather than period-scoped, matching
        // how the column has always read.
        //
        // Both key paths are added on the return side, unlike the fall-through
        // on the issue side: a linked and an unlinked line are different lines,
        // and missing one of them would leave stock reading as still out.
        const sku = matchKey(item.sku);
        const issuedOnAsn = asnIssued.byItemId.get(item.id)
          ?? (ambiguousSkus.has(sku) ? undefined : asnIssued.bySkuUnlinked.get(sku))
          ?? 0;
        const returnedOnRtn = (rtnReturned.byItemId.get(item.id) ?? 0)
          + (ambiguousSkus.has(sku) ? 0 : (rtnReturned.bySkuUnlinked.get(sku) ?? 0));
        const assigned = Math.max(0, issuedOnAsn - returnedOnRtn);

        // Issued — consumption logged inside the period. Reported, but not
        // subtracted below: consuming stock requires holding it first
        // (`recordUsage` rejects usage beyond `assignedQuantity`), so it is
        // stock that already left the warehouse under `assigned`.
        const issuedInPeriod = (usageByItem.get(item.id) ?? [])
          .filter(u => u.date >= from && u.date <= to)
          .reduce((s, u) => s + u.qty, 0);

        // Closing — what the documents say should be on the shelf: everything
        // received, less everything still out with a worker.
        //
        // Floored at zero because only a formal RTN document is netted off
        // above. A hand-back recorded the older way — an ad-hoc return request,
        // which adjusts inventory but is never written back to the ASN that
        // issued it — still counts as gone, so stock handed out, given back and
        // handed out again counts twice and drives the figure negative. A row
        // reading 0 with a large Assigned is that, not an empty shelf.
        const closing = Math.max(0, opening + received - assigned);

        return {
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          serialNumber: item.serialNumber || '',
          schemeNo: item.schemeNo || '',
          grnNo: item.grnNo || '',
          category: item.category || '',
          opening,
          received,
          assigned,
          issued: issuedInPeriod,
          closing,
        };
      });
  }, [list, usageByItem, receiptsByItem, asnIssued, rtnReturned, ambiguousSkus, dateFrom, dateTo, search, schemeFilters, categoryFilters]);

  // Totals
  const totals = useMemo(() => ({
    opening: reportRows.reduce((s, r) => s + r.opening, 0),
    received: reportRows.reduce((s, r) => s + r.received, 0),
    assigned: reportRows.reduce((s, r) => s + r.assigned, 0),
    issued: reportRows.reduce((s, r) => s + r.issued, 0),
    closing: reportRows.reduce((s, r) => s + r.closing, 0),
  }), [reportRows]);

  /** Whether any approved return has been documented, which is what makes the Assigned column a net figure. */
  const hasRtnActivity = rtnReturned.byItemId.size > 0 || rtnReturned.bySkuUnlinked.size > 0;

  const setQuickRange = (range: typeof QUICK_RANGES[0]) => {
    const { from, to } = range.getValue();
    setDateFrom(from);
    setDateTo(to);
  };

  const exportExcel = () => {
    const data = reportRows.map(r => ({
      'Product': r.name,
      'SKU': r.sku,
      'Serial No.': r.serialNumber,
      'Scheme No.': r.schemeNo,
      'GRN No.': r.grnNo,
      'Category': r.category,
      'Opening': r.opening,
      'Received': r.received,
      'Assigned': r.assigned,
      'Issued': r.issued,
      'Closing': r.closing,
    }));

    // Add totals row
    data.push({
      'Product': 'TOTAL',
      'SKU': '',
      'Serial No.': '',
      'Scheme No.': '',
      'GRN No.': '',
      'Category': '',
      'Opening': totals.opening,
      'Received': totals.received,
      'Assigned': totals.assigned,
      'Issued': totals.issued,
      'Closing': totals.closing,
    });

    const ws = XLSX.utils.json_to_sheet(data);

    // Bold the totals row
    const totalRowIdx = data.length + 1; // 1-indexed + header
    ws[`A${totalRowIdx}`] = { v: 'TOTAL', t: 's', s: { font: { bold: true } } };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Report');
    XLSX.writeFile(wb, `stock-report-${dateFrom || 'all'}-to-${dateTo || 'today'}.xlsx`);
  };

  /**
   * The PDF record of this report, laid out to match the printed warehouse
   * documents (see components/documents/PrintDocument.tsx) — same ink, tinted
   * doc-number box, title bar over the purple/cyan strip, zebra table.
   *
   * Rows are `reportRows`, so the export is exactly what the table is showing:
   * already filtered by date, scheme, category and search.
   */
  const exportPdf = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.width;        // 297mm
    const pageH = doc.internal.pageSize.height;       // 210mm
    const marginL = 14;                               // left margin
    const marginR = 14;                               // right margin
    const contentW = pageW - marginL - marginR;       // usable width = 269mm
    // Every band on the page — header box, title bar, strip, stats, table —
    // is laid out from marginL and contentW, so they share both edges exactly.

    // ── Load logo ──
    let logoAdded = false;
    try {
      const response = await fetch('/smartlife.png');
      const blob = await response.blob();
      const reader = new FileReader();
      const logoData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      // 34.4 × 13 keeps the asset's own 952×360 proportions — the print header
      // sets a height and lets the width follow, and a stretched logo is the one
      // thing that reads as "not the same document".
      doc.addImage(logoData, 'PNG', marginL, 10, 34.4, 13);
      logoAdded = true;
    } catch { /* skip logo if fails */ }

    // ── Company name ──
    const textX = marginL;
    const nameY = logoAdded ? 27 : 14;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 62);
    doc.text('SMART LIFE CONTRACTING COMPANY', textX, nameY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text('WAREHOUSE & INVENTORY MANAGEMENT', textX, nameY + 4);

    // ── Report period box (top right) ──
    // From and to sit on their own lines: a single "01 Aug 2026 → 04 Aug 2026"
    // run is wider than the box at any weight worth reading.
    const boxW = 75, boxH = 26, boxX = pageW - marginR - boxW, boxY = 8;
    doc.setFillColor(240, 240, 248);
    doc.setDrawColor(224, 224, 239);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

    const fromText = dateFrom ? format(new Date(dateFrom), 'dd MMM yyyy') : 'All time';
    const toText = dateTo ? format(new Date(dateTo), 'dd MMM yyyy') : 'Today';

    // Line 1: FROM date
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('FROM', boxX + boxW - 4, boxY + 6, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 62);
    doc.text(fromText, boxX + boxW - 4, boxY + 11, { align: 'right' });

    // Line 2: TO date
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('TO', boxX + boxW - 4, boxY + 16, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 62);
    doc.text(toText, boxX + boxW - 4, boxY + 21, { align: 'right' });

    // ── Generated stamp, below the box ──
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(
      `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
      pageW - marginR,
      boxY + boxH + 5,
      { align: 'right' },
    );

    // ── Title bar ──
    // Pushed down to clear the taller box (ends at 34) and the generated stamp
    // below it (baseline 39); everything under the bar is measured off titleY.
    const titleY = 43;
    doc.setFillColor(26, 26, 62);
    doc.rect(marginL, titleY, contentW, 9, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('STOCK MOVEMENT REPORT', marginL + contentW / 2, titleY + 6.2, { align: 'center' });

    // ── Two-color accent strip ──
    const stripY = titleY + 9;
    const stripW = contentW / 2;
    doc.setFillColor(107, 47, 217);  // Purple
    doc.rect(marginL, stripY, stripW, 2.5, 'F');
    doc.setFillColor(0, 194, 255);   // Cyan
    doc.rect(marginL + stripW, stripY, stripW, 2.5, 'F');

    // ── Summary stat boxes ──
    const statsY = stripY + 5;
    const statsH = 14;
    const statW = contentW / 4;  // exactly 67.25mm each
    const stats = [
      { label: 'OPENING STOCK', value: totals.opening.toLocaleString(), color: [26, 26, 62] as [number, number, number] },
      { label: 'RECEIVED', value: `+${totals.received.toLocaleString()}`, color: [0, 150, 80] as [number, number, number] },
      { label: 'ASSIGNED', value: totals.assigned.toLocaleString(), color: [107, 47, 217] as [number, number, number] },
      { label: 'CLOSING STOCK', value: totals.closing.toLocaleString(), color: [0, 136, 204] as [number, number, number] },
    ];
    // One rectangle across the full content width, then dividers — four abutting
    // rects double-strike their shared edges, which is what reads as a gap.
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(229, 231, 235);
    doc.rect(marginL, statsY, contentW, statsH, 'FD');
    for (let i = 1; i < 4; i++) {
      doc.line(marginL + i * statW, statsY, marginL + i * statW, statsY + statsH);
    }

    stats.forEach((stat, i) => {
      const sx = marginL + i * statW;
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(156, 163, 175);
      doc.text(stat.label, sx + statW / 2, statsY + 4.5, { align: 'center' });
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...stat.color);
      doc.text(stat.value, sx + statW / 2, statsY + 11, { align: 'center' });
    });

    // ── Table label ──
    const tableLabelY = statsY + statsH + 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 62);
    doc.text('STOCK ITEMS', marginL, tableLabelY);

    // ── Main table ──
    autoTable(doc, {
      startY: tableLabelY + 3,
      head: [['#', 'Product', 'SKU', 'Scheme', 'Opening', 'Received', 'Assigned', 'Issued', 'Closing']],
      body: [
        ...reportRows.map((row, idx) => [
          idx + 1,
          row.name,
          row.sku,
          row.schemeNo || '—',
          row.opening || '—',
          row.received > 0 ? `+${row.received}` : '—',
          row.assigned > 0 ? String(row.assigned) : '—',
          row.issued > 0 ? `-${row.issued}` : '—',
          row.closing,
        ]),
        // Totals row
        ['', `TOTAL (${reportRows.length} items)`, '', '',
          totals.opening, `+${totals.received}`, totals.assigned,
          totals.issued > 0 ? `-${totals.issued}` : '0', totals.closing],
      ],
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: {
        fillColor: [26, 26, 62],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      // Widths sum to contentW (269mm), so the table spans the same band as the
      // title bar and the stats row: 8+65+38+38+24+24+24+24+24.
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 65 },
        2: { cellWidth: 38, font: 'courier', fontSize: 7 },
        3: { cellWidth: 38 },
        4: { cellWidth: 24, halign: 'center' },
        5: { cellWidth: 24, halign: 'center', textColor: [0, 150, 80] },
        6: { cellWidth: 24, halign: 'center', textColor: [107, 47, 217] },
        7: { cellWidth: 24, halign: 'center', textColor: [200, 100, 0] },
        8: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [248, 248, 252] },
      didParseCell: (data) => {
        // Style totals row. Section-guarded: with no rows at all the totals row
        // sits at body index 0, which would otherwise repaint the header too.
        if (data.section === 'body' && data.row.index === reportRows.length) {
          data.cell.styles.fillColor = [240, 240, 248];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 9;
          data.cell.styles.textColor = [26, 26, 62];
        }
      },
      didDrawPage: (data) => {
        // Footer on every page
        const totalPages = doc.getNumberOfPages();
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text(
          'Smart Life Contracting Company — Confidential',
          marginL,
          pageH - 6,
        );
        doc.text(
          `Page ${data.pageNumber} of ${totalPages}`,
          pageW - marginR,
          pageH - 6,
          { align: 'right' },
        );
      },
      margin: { top: 50, left: marginL, right: marginR, bottom: 12 },
    });

    // ── Notes under the table ──
    const notes: string[] = [];

    // How the Assigned column was arrived at, but only once returns are actually
    // being documented — on a site with no RTN yet it would explain a subtraction
    // that never happened.
    if (hasRtnActivity) {
      notes.push('Assigned = total issued via ASN minus returned via RTN documents.');
    }

    const filterParts = [];
    if (schemeFilters.length > 0) filterParts.push(`Schemes: ${schemeFilters.join(', ')}`);
    if (categoryFilters.length > 0) filterParts.push(`Categories: ${categoryFilters.join(', ')}`);
    if (search) filterParts.push(`Search: "${search}"`);
    if (dateFrom || dateTo) filterParts.push(`Date: ${dateFrom || 'All'} → ${dateTo || 'Today'}`);
    if (filterParts.length > 0) notes.push(`Filters applied: ${filterParts.join(' · ')}`);

    if (notes.length > 0) {
      // autoTable stamps this on the doc but does not augment jsPDF's types.
      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      notes.forEach((note, index) => doc.text(note, marginL, finalY + index * 4));
    }

    // Save
    doc.save(`stock-report-${dateFrom || 'all'}-to-${dateTo || 'today'}.pdf`);
  };

  const clearFilters = () => {
    setSearch(''); setSchemeFilters([]); setCategoryFilters([]);
    // Reset dates to this month default, not empty (empty breaks date formatting)
    setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setDateTo(today);
  };
  const hasFilters = !!search || schemeFilters.length > 0 || categoryFilters.length > 0;

  const statCard = (label: string, value: number, color: string, bg: string) => (
    <div style={{ flex: 1, background: bg, border: `1px solid ${color}33`, borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value.toLocaleString()}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <p className="text-muted text-sm">
          {dateFrom ? format(new Date(dateFrom), 'dd MMM yyyy') : 'All time'} → {dateTo ? format(new Date(dateTo), 'dd MMM yyyy') : 'today'}
          {' · '}{reportRows.length} items
        </p>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={exportExcel}>
            <Download size={14} /> Excel
          </button>
          <button className="btn btn-ghost" onClick={() => exportPdf()}>
            <FileDown size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Quick range buttons */}
      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        {QUICK_RANGES.map(r => (
          <button key={r.label} className="btn btn-ghost btn-sm" onClick={() => setQuickRange(r)}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Date + Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>From Date</label>
            <input type="date" className="form-input" style={{ width: 160 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>To Date</label>
            <input type="date" className="form-input" style={{ width: 160 }} value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} max={today} />
          </div>
          <div className="search-bar">
            <Search size={14} />
            <input placeholder="Search product, SKU, serial, scheme…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <MultiSelect
            options={schemeOptions}
            selected={schemeFilters}
            onChange={setSchemeFilters}
            placeholder="All Schemes"
          />
          <MultiSelect
            options={categoryOptions}
            selected={categoryFilters}
            onChange={setCategoryFilters}
            placeholder="All Categories"
          />
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <Filter size={13} /> Clear
            </button>
          )}
        </div>

        {hasFilters && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong style={{ color: 'var(--text)' }}>{reportRows.length}</strong> of {list.length} items
            {schemeFilters.length > 0 && ` · Schemes: ${schemeFilters.join(', ')}`}
            {categoryFilters.length > 0 && ` · Categories: ${categoryFilters.join(', ')}`}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {statCard('Opening Stock', totals.opening, 'var(--text)', 'var(--bg-2)')}
        {statCard('Received', totals.received, 'var(--green)', 'var(--green-dim)')}
        {statCard('Assigned', totals.assigned, 'var(--purple)', 'var(--purple-dim)')}
        {statCard('Issued / Used', totals.issued, 'var(--yellow)', 'var(--yellow-dim)')}
        {statCard('Closing Stock', totals.closing, 'var(--accent)', 'var(--accent-dim)')}
      </div>

      {/* Report Table */}
      {reportRows.length === 0 ? (
        <div className="empty-state">
          <BarChart2 size={48} style={{ color: 'var(--text-3)' }} />
          <span>No data for selected period</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Serial No.</th>
                <th>Scheme</th>
                <th>GRN No.</th>
                <th>Category</th>
                <th style={{ textAlign: 'center', background: 'var(--bg-3)' }}>Opening</th>
                <th style={{ textAlign: 'center', color: 'var(--green)' }}>Received</th>
                <th style={{ textAlign: 'center', color: 'var(--purple)' }}>Assigned</th>
                <th style={{ textAlign: 'center', color: 'var(--yellow)' }}>Issued</th>
                <th style={{ textAlign: 'center', color: 'var(--accent)' }}>Closing</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map(row => {
                const closingColor = row.closing === 0 ? 'var(--red)' : row.closing <= 3 ? 'var(--yellow)' : 'var(--green)';
                return (
                  <tr key={row.itemId}>
                    <td style={{ fontWeight: 500 }}>{row.name}</td>
                    <td>
                      <code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>
                        {row.sku}
                      </code>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      <SerialNumbers value={row.serialNumber} />
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.schemeNo || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {row.grnNo
                        ? <span className="badge badge-blue">{row.grnNo}</span>
                        : <span style={{ color: 'var(--text-3)' }}>No GRN</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.category || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.opening}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.received > 0 ? 'var(--green)' : 'var(--text-3)' }}>
                      {row.received > 0 ? `+${row.received}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.assigned !== 0 ? 'var(--purple)' : 'var(--text-3)' }}>
                      {row.assigned !== 0 ? row.assigned : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.issued > 0 ? 'var(--yellow)' : 'var(--text-3)' }}>
                      {row.issued > 0 ? `-${row.issued}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: closingColor }}>
                      {row.closing}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr style={{ background: 'var(--bg-3)', fontWeight: 700, fontSize: 13 }}>
                <td colSpan={6} style={{ padding: '10px 16px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
                  Total ({reportRows.length} items)
                </td>
                <td style={{ textAlign: 'center', padding: '10px 16px' }}>{totals.opening}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--green)' }}>+{totals.received}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--purple)' }}>{totals.assigned}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--yellow)' }}>-{totals.issued}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--accent)', fontSize: 16 }}>{totals.closing}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
        <strong style={{ color: 'var(--text-2)' }}>How it works:</strong>
        {' '}Every figure is derived from documents, not from live inventory balances. Opening = received via GRN before this period · Received = received via GRN in this period · Assigned = total handed out on Assignment Forms minus what approved Return Documents (RTN) brought back, all time · Issued = consumed via the usage log in this period · <strong style={{ color: 'var(--text-2)' }}>Closing = Opening + Received − Assigned</strong>. Issued is shown but not subtracted — stock has to be assigned before it can be consumed, so it already left the warehouse under Assigned. Only items with GRN history appear, and Closing will not always match the Inventory page.
      </div>
    </div>
  );
}