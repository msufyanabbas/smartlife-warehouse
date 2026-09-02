import { useState, useMemo, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart2, ClipboardCheck, Download, FileDown, Search, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  useInventory, useItemUsage, useGrnList, useAssignmentForms, useRtnList,
  useTransferForms, useMicList,
} from '../hooks/useApi';
import MultiSelect from '../components/MultiSelect';
import { drawReportChrome, drawStatBoxes, drawReportFooter } from '../components/documents/reportPdf';
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
  /**
   * The warehouse's own grading of the unit — new / good / fair / poor. Safe to
   * read here, unlike the quantity columns above: it is a property of the stock
   * rather than a running balance, so it carries no period to be wrong about.
   */
  condition?: string;
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
  condition?: string; reason?: string;
}

interface RtnDocumentRow {
  id: string; rtnNo: string; status: string;
  approvedAt?: string; createdAt?: string;
  items?: RtnLine[];
}

interface MicLine {
  itemCode?: string; qtyInstalled?: number; itemId?: string;
}

interface MicDocumentRow {
  id: string; micNo: string; status: string;
  items?: MicLine[];
}

interface TrfLine {
  itemCode?: string; qtyToTransfer?: number; itemId?: string;
}

interface TrfDocumentRow {
  id: string; transferNo: string; status: string;
  transferDate?: string; updatedAt?: string; createdAt?: string;
  items?: TrfLine[];
}

interface StockRow {
  itemId: string;
  name: string;
  sku: string;
  serialNumber: string;
  schemeNo: string;
  grnNo: string;
  category: string;
  /** The row's own grading, lowercased so the filter never misses on casing. */
  condition: string;
  /** Condition and reason off the last approved RTN line, blank if never returned. */
  rtnCondition: string;
  rtnReason: string;
  opening: number;
  received: number;
  assigned: number;
  /**
   * What was handed out and is still unaccounted for: assigned, less what an
   * approved MIC fitted, an approved RTN brought back, or a completed TRF
   * handed on to someone else.
   *
   * All-time like `assigned`, and for the same reason — the four documents have
   * to be read over the same span or the subtraction is between figures that do
   * not belong to each other. A row reading zero here has had every unit it was
   * ever issued accounted for by a document.
   */
  stillOut: number;
  /**
   * How much of this row a completed TRF moved inside the period.
   *
   * Carried on the row but not shown on this tab: a transfer changes who holds
   * the stock, never how much of it there is, so it belongs to neither side of
   * the opening / received / assigned / closing balance this table reports.
   * Where the movement is actually read is the Issued Items tab, which asks
   * what became of stock after it was handed out — the question a transfer
   * answers.
   */
  transferred: number;
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

/**
 * Two different vocabularies, deliberately kept apart.
 *
 * An inventory row is graded new / good / fair / poor — that is the shelf's own
 * view of the stock. An RTN line is graded Good / Damaged / Expired / Other —
 * that is the site's verdict at the moment it came back. They are not the same
 * scale and neither is derivable from the other, so a row can read "good" on the
 * shelf and still show that its last return came in Damaged.
 */
const ITEM_CONDITIONS = ['new', 'good', 'fair', 'poor'];

const CONDITION_BADGE: Record<string, string> = {
  new: 'green', good: 'blue', fair: 'yellow', poor: 'red',
};
const CONDITION_COLOR: Record<string, string> = {
  new: '#10b981', good: '#3b82f6', fair: '#f59e0b', poor: '#ef4444',
};
/** The same swatches as RGB triples, for jsPDF — it takes no CSS colours. */
const CONDITION_RGB: Record<string, [number, number, number]> = {
  new: [16, 185, 129], good: [59, 130, 246], fair: [245, 158, 11], poor: [239, 68, 68],
};

const RTN_CONDITION_COLOR: Record<string, string> = {
  Good: '#10b981', Damaged: '#ef4444', Expired: '#f59e0b', Other: '#6b7280',
};
/** Mirrors the picker on the RTN form, so a chip exists for every reason a line can carry. */
const RTN_REASONS = ['Project Complete', 'Defective', 'Excess Stock', 'Wrong Item', 'Other'];

const conditionColor = (c: string) => CONDITION_COLOR[c] ?? '#6b7280';
const rtnConditionColor = (c: string) => RTN_CONDITION_COLOR[c] ?? '#6b7280';
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

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
  const { data: transferFormsData = [] } = useTransferForms();
  const { data: micData = [] } = useMicList();

  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [schemeFilters, setSchemeFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [conditionFilters, setConditionFilters] = useState<string[]>([]);
  const [rtnReasonFilters, setRtnReasonFilters] = useState<string[]>([]);

  const list = items as InventoryItem[];
  const usage = usageData as UsageRecord[];
  const grns = grnData as GrnDocument[];
  const assignmentForms = assignmentFormsData as AssignmentFormDocument[];
  const rtns = rtnData as RtnDocumentRow[];
  const trfs = transferFormsData as TrfDocumentRow[];
  const mics = micData as MicDocumentRow[];

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

  /**
   * What the *last* approved return said about each row: the condition it came
   * back in, and why it came back.
   *
   * Kept apart from `rtnReturned`, which only ever needs quantities. A row can be
   * returned against several times, and the useful reading is the most recent
   * verdict rather than the first — so the approved returns are walked oldest
   * first and each write overwrites the one before it. Keyed the same two ways
   * as the quantity map, for the same reason: a line normally names its row
   * outright, and one carrying only a SKU falls back to the SKU map.
   */
  const rtnDetail = useMemo(() => {
    const byItemId = new Map<string, { condition: string; reason: string }>();
    const bySkuUnlinked = new Map<string, { condition: string; reason: string }>();
    const approvedOldestFirst = rtns
      .filter(r => r.status === 'approved')
      .sort((a, b) =>
        new Date(a.approvedAt || a.createdAt || 0).getTime()
        - new Date(b.approvedAt || b.createdAt || 0).getTime());

    for (const rtn of approvedOldestFirst) {
      for (const line of rtn.items ?? []) {
        const detail = { condition: line.condition || '', reason: line.reason || '' };
        // A line that stated neither would blank out an earlier line that did.
        if (!detail.condition && !detail.reason) continue;
        if (line.itemId) {
          byItemId.set(line.itemId, detail);
        } else if (line.itemCode?.trim()) {
          bySkuUnlinked.set(matchKey(line.itemCode), detail);
        }
      }
    }
    return { byItemId, bySkuUnlinked };
  }, [rtns]);

  /**
   * What approved MIC forms fitted out of each inventory row, counted across
   * all time.
   *
   * Installed stock is the end of the line: it left the warehouse on an ASN and
   * is never coming back, so it is what separates "handed out" from "still
   * unaccounted for". Only approved MICs count — a pending confirmation is a
   * claim about site work, not a record of it.
   *
   * Keyed the two ways every document map here is keyed: a line normally names
   * its inventory row outright, and one carrying only a SKU falls into the SKU
   * map so it is never counted twice.
   */
  const micInstalled = useMemo(() => {
    const byItemId = new Map<string, number>();
    const bySkuUnlinked = new Map<string, number>();
    for (const mic of mics) {
      if (mic.status !== 'approved') continue;
      for (const line of mic.items ?? []) {
        const qty = line.qtyInstalled ?? 0;
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
  }, [mics]);

  /**
   * What completed transfer forms moved off each inventory row, dated so a
   * period can be cut out of it.
   *
   * A transfer is the one movement that leaves the totals alone: `completeTransfer()`
   * takes the quantity off the issuer and hands it to the receiver — or books it
   * back onto the shelf when the receiver is not a worker — so the row's own
   * total never changes and nothing about it survives to be read back later. The
   * TRF documents are the only record that the stock moved at all, which is what
   * makes them the only way to explain an Assigned figure that shifted between
   * two periods with no hand-out and no return behind it.
   *
   * Keyed the two ways every other document map here is keyed: a line normally
   * names its inventory row outright (`findLineItem()` prefers `itemId`), and one
   * carrying only a SKU falls into the SKU map so it is never counted twice.
   * Drafts and approved-but-not-yet-completed forms are excluded — nothing has
   * moved until the form is completed.
   */
  const trfTransferred = useMemo(() => {
    const byItemId = new Map<string, { date: Date | null; qty: number }[]>();
    const bySkuUnlinked = new Map<string, { date: Date | null; qty: number }[]>();
    for (const trf of trfs) {
      if (trf.status !== 'completed') continue;
      // `transferDate` is the date the warehouse put on the form; the timestamps
      // are the fallback for a form that never had one filled in.
      const stamp = trf.transferDate || trf.updatedAt || trf.createdAt;
      const date = stamp ? parseDate(stamp) : null;
      for (const line of trf.items ?? []) {
        const qty = line.qtyToTransfer ?? 0;
        if (qty <= 0) continue;
        if (line.itemId) {
          byItemId.set(line.itemId, [...(byItemId.get(line.itemId) ?? []), { date, qty }]);
        } else if (line.itemCode?.trim()) {
          const sku = matchKey(line.itemCode);
          bySkuUnlinked.set(sku, [...(bySkuUnlinked.get(sku) ?? []), { date, qty }]);
        }
      }
    }
    return { byItemId, bySkuUnlinked };
  }, [trfs]);

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

    /**
     * The verdict the last approved return left on this row, resolved the same
     * way its quantity was: by row id, falling back to SKU only where that SKU
     * sits on a single row — on a duplicated SKU there is no telling which row
     * the return came off, and guessing would label the wrong stock Damaged.
     */
    const returnVerdict = (item: InventoryItem) => {
      const sku = matchKey(item.sku);
      return rtnDetail.byItemId.get(item.id)
        ?? (ambiguousSkus.has(sku) ? undefined : rtnDetail.bySkuUnlinked.get(sku));
    };

    /**
     * What completed TRFs moved off this row inside the period.
     *
     * Both key paths are added rather than fallen through, as on the return
     * side: a linked and an unlinked line are different lines on different
     * forms, and taking only the first would under-report the movement. An
     * unlinked line on a duplicated SKU is dropped — there is no telling which
     * of those rows it came off, and crediting every one of them would report
     * the same transfer several times over.
     *
     * A form with no date at all is counted in every period rather than
     * vanishing from all of them.
     */
    const transferredInPeriod = (item: InventoryItem) => {
      const sku = matchKey(item.sku);
      const moves = [
        ...(trfTransferred.byItemId.get(item.id) ?? []),
        ...(ambiguousSkus.has(sku) ? [] : (trfTransferred.bySkuUnlinked.get(sku) ?? [])),
      ];
      return moves
        .filter(m => !m.date || (m.date >= from && m.date <= to))
        .reduce((sum, m) => sum + m.qty, 0);
    };

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
        const matchCondition = !conditionFilters.length
          || conditionFilters.includes((item.condition || '').toLowerCase());
        // Picking a reason narrows to stock that actually came back for it, so a
        // row with no approved return drops out rather than matching on blank.
        const matchReason = !rtnReasonFilters.length
          || rtnReasonFilters.includes(returnVerdict(item)?.reason || '');
        return matchSearch && matchScheme && matchCat && matchCondition && matchReason;
      })
      .map(item => {
        const receipts = receiptsByItem.get(item.id) ?? [];
        const verdict = returnVerdict(item);
        const transferred = transferredInPeriod(item);

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

        // Still Out — the same hand-out, followed through to the three documents
        // that close it off. Transferred is read all-time here rather than from
        // the period-scoped figure above: it is being subtracted from an
        // all-time `assigned`, and a period slice of one against all of the
        // other would report stock as outstanding purely because the transfer
        // that settled it fell outside the window.
        const installedOnMic = (micInstalled.byItemId.get(item.id) ?? 0)
          + (ambiguousSkus.has(sku) ? 0 : (micInstalled.bySkuUnlinked.get(sku) ?? 0));
        const transferredAllTime = [
          ...(trfTransferred.byItemId.get(item.id) ?? []),
          ...(ambiguousSkus.has(sku) ? [] : (trfTransferred.bySkuUnlinked.get(sku) ?? [])),
        ].reduce((sum, move) => sum + move.qty, 0);
        const stillOut = Math.max(
          0,
          issuedOnAsn - returnedOnRtn - installedOnMic - transferredAllTime,
        );

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
          condition: (item.condition || '').toLowerCase(),
          rtnCondition: verdict?.condition || '',
          rtnReason: verdict?.reason || '',
          opening,
          received,
          assigned,
          stillOut,
          // Deliberately absent from `closing` above: a transfer moves stock
          // between holders without creating or consuming any, so netting it
          // into the balance would report the same units leaving twice.
          transferred,
          issued: issuedInPeriod,
          closing,
        };
      });
  }, [list, usageByItem, receiptsByItem, asnIssued, rtnReturned, rtnDetail, trfTransferred, micInstalled, ambiguousSkus, dateFrom, dateTo, search, schemeFilters, categoryFilters, conditionFilters, rtnReasonFilters]);

  // Totals
  const totals = useMemo(() => ({
    opening: reportRows.reduce((s, r) => s + r.opening, 0),
    received: reportRows.reduce((s, r) => s + r.received, 0),
    assigned: reportRows.reduce((s, r) => s + r.assigned, 0),
    stillOut: reportRows.reduce((s, r) => s + r.stillOut, 0),
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
      'Condition': titleCase(r.condition),
      'Returned As': r.rtnCondition,
      'Return Reason': r.rtnReason,
      'Opening': r.opening,
      'Received': r.received,
      'Assigned': r.assigned,
      'Still Out': r.stillOut,
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
      'Condition': '',
      'Returned As': '',
      'Return Reason': '',
      'Opening': totals.opening,
      'Received': totals.received,
      'Assigned': totals.assigned,
      'Still Out': totals.stillOut,
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

    const fromText = dateFrom ? format(new Date(dateFrom), 'dd MMM yyyy') : 'All time';
    const toText = dateTo ? format(new Date(dateTo), 'dd MMM yyyy') : 'Today';

    const chrome = await drawReportChrome(doc, {
      title: 'STOCK MOVEMENT REPORT',
      meta: [{ label: 'FROM', value: fromText }, { label: 'TO', value: toText }],
    });
    const { marginL, marginR } = chrome;

    // ── Summary stat boxes ──
    const statsEndY = drawStatBoxes(doc, chrome, chrome.contentY + 2.5, [
      { label: 'OPENING STOCK', value: totals.opening.toLocaleString(), color: [26, 26, 62] },
      { label: 'RECEIVED', value: `+${totals.received.toLocaleString()}`, color: [0, 150, 80] },
      { label: 'ASSIGNED', value: totals.assigned.toLocaleString(), color: [107, 47, 217] },
      { label: 'CLOSING STOCK', value: totals.closing.toLocaleString(), color: [0, 136, 204] },
    ]);

    // ── Table label ──
    const tableLabelY = statsEndY + 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 62);
    doc.text('STOCK ITEMS', marginL, tableLabelY);

    // ── Main table ──
    autoTable(doc, {
      startY: tableLabelY + 3,
      head: [['#', 'Product', 'SKU', 'Scheme', 'Condition', 'Opening', 'Received', 'Assigned', 'Still Out', 'Issued', 'Closing']],
      body: [
        ...reportRows.map((row, idx) => [
          idx + 1,
          row.name,
          row.sku,
          row.schemeNo || '—',
          titleCase(row.condition) || '—',
          row.opening || '—',
          row.received > 0 ? `+${row.received}` : '—',
          row.assigned > 0 ? String(row.assigned) : '—',
          row.stillOut > 0 ? String(row.stillOut) : '—',
          row.issued > 0 ? `-${row.issued}` : '—',
          row.closing,
        ]),
        // Totals row
        ['', `TOTAL (${reportRows.length} items)`, '', '', '',
          totals.opening, `+${totals.received}`, totals.assigned,
          totals.stillOut > 0 ? String(totals.stillOut) : '0',
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
      // title bar and the stats row: 8+55+28+26+20+22*6. Still Out was paid for
      // out of the three text columns and a millimetre off each figure — it is
      // the widest heading on the numeric run, so those could not simply be
      // divided one further.
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 55 },
        2: { cellWidth: 28, font: 'courier', fontSize: 7 },
        3: { cellWidth: 26 },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 22, halign: 'center' },
        6: { cellWidth: 22, halign: 'center', textColor: [0, 150, 80] },
        7: { cellWidth: 22, halign: 'center', textColor: [107, 47, 217] },
        // Red: an outstanding figure is the one number on the row that asks
        // somebody to go and find the stock.
        8: { cellWidth: 22, halign: 'center', textColor: [239, 68, 68] },
        9: { cellWidth: 22, halign: 'center', textColor: [200, 100, 0] },
        10: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [248, 248, 252] },
      didParseCell: (data) => {
        // Condition inks itself — the same swatches the on-screen badges use, so
        // a Poor row reads red on paper too. Body rows only: the totals row has
        // no condition and is repainted whole below.
        if (data.section === 'body' && data.column.index === 4 && data.row.index < reportRows.length) {
          const rgb = CONDITION_RGB[reportRows[data.row.index].condition];
          if (rgb) {
            data.cell.styles.textColor = rgb;
            data.cell.styles.fontStyle = 'bold';
          }
        }
        // Style totals row. Section-guarded: with no rows at all the totals row
        // sits at body index 0, which would otherwise repaint the header too.
        if (data.section === 'body' && data.row.index === reportRows.length) {
          data.cell.styles.fillColor = [240, 240, 248];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 9;
          data.cell.styles.textColor = [26, 26, 62];
        }
      },
      didDrawPage: (data) => drawReportFooter(doc, chrome, data.pageNumber),
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
    if (conditionFilters.length > 0) filterParts.push(`Condition: ${conditionFilters.map(titleCase).join(', ')}`);
    if (rtnReasonFilters.length > 0) filterParts.push(`Return reason: ${rtnReasonFilters.join(', ')}`);
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
    setConditionFilters([]); setRtnReasonFilters([]);
    // Reset dates to this month default, not empty (empty breaks date formatting)
    setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setDateTo(today);
  };
  const hasFilters = !!search || schemeFilters.length > 0 || categoryFilters.length > 0
    || conditionFilters.length > 0 || rtnReasonFilters.length > 0;

  /** One filter chip. Active paints the swatch solid; idle keeps it as the outline. */
  const filterChip = (label: string, color: string, active: boolean, onToggle: () => void) => (
    <button
      key={label}
      onClick={onToggle}
      style={{
        padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        borderRadius: 999, border: `1px solid ${active ? color : 'var(--border)'}`,
        background: active ? color : 'transparent',
        color: active ? '#fff' : color,
      }}
    >
      {label}
    </button>
  );

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

        {/* Condition of the stock on the shelf, and why the last return sent it
            back — two separate questions, so two separate chip rows. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 84 }}>
            Condition
          </span>
          {ITEM_CONDITIONS.map(cond => filterChip(
            titleCase(cond),
            conditionColor(cond),
            conditionFilters.includes(cond),
            () => setConditionFilters(prev => prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]),
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 84 }}>
            Return Reason
          </span>
          {RTN_REASONS.map(reason => filterChip(
            reason,
            'var(--purple)',
            rtnReasonFilters.includes(reason),
            () => setRtnReasonFilters(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]),
          ))}
        </div>

        {hasFilters && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong style={{ color: 'var(--text)' }}>{reportRows.length}</strong> of {list.length} items
            {schemeFilters.length > 0 && ` · Schemes: ${schemeFilters.join(', ')}`}
            {categoryFilters.length > 0 && ` · Categories: ${categoryFilters.join(', ')}`}
            {conditionFilters.length > 0 && ` · Condition: ${conditionFilters.map(titleCase).join(', ')}`}
            {rtnReasonFilters.length > 0 && ` · Returned for: ${rtnReasonFilters.join(', ')}`}
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
                <th>Condition</th>
                <th>Returned As</th>
                <th style={{ textAlign: 'center', background: 'var(--bg-3)' }}>Opening</th>
                <th style={{ textAlign: 'center', color: 'var(--green)' }}>Received</th>
                <th style={{ textAlign: 'center', color: 'var(--purple)' }}>Assigned</th>
                <th style={{ textAlign: 'center', color: 'var(--red)' }}>Still Out</th>
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
                    <td>
                      {row.condition
                        ? <span className={`badge badge-${CONDITION_BADGE[row.condition] || 'blue'}`}>{row.condition}</span>
                        : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.rtnCondition || row.rtnReason ? (
                        <>
                          {row.rtnCondition && (
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: `${rtnConditionColor(row.rtnCondition)}22`,
                              color: rtnConditionColor(row.rtnCondition),
                            }}>
                              {row.rtnCondition}
                            </span>
                          )}
                          {row.rtnReason && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{row.rtnReason}</div>
                          )}
                        </>
                      ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.opening}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.received > 0 ? 'var(--green)' : 'var(--text-3)' }}>
                      {row.received > 0 ? `+${row.received}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.assigned !== 0 ? 'var(--purple)' : 'var(--text-3)' }}>
                      {row.assigned !== 0 ? row.assigned : '—'}
                    </td>
                    <td style={{
                      textAlign: 'center',
                      color: row.stillOut > 0 ? 'var(--red)' : 'var(--text-3)',
                      fontWeight: row.stillOut > 0 ? 700 : 400,
                    }}>
                      {row.stillOut > 0 ? row.stillOut : '—'}
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
                <td colSpan={8} style={{ padding: '10px 16px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
                  Total ({reportRows.length} items)
                </td>
                <td style={{ textAlign: 'center', padding: '10px 16px' }}>{totals.opening}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--green)' }}>+{totals.received}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--purple)' }}>{totals.assigned}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: totals.stillOut > 0 ? 'var(--red)' : 'var(--text-3)' }}>
                  {totals.stillOut > 0 ? totals.stillOut : '—'}
                </td>
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
        {' '}Every figure is derived from documents, not from live inventory balances. Opening = received via GRN before this period · Received = received via GRN in this period · Assigned = total handed out on Assignment Forms minus what approved Return Documents (RTN) brought back, all time · <strong style={{ color: 'var(--text-2)' }}>Still Out = Assigned − Installed (MIC) − Transferred (TRF)</strong>, all time — what was handed out and no document has yet accounted for · Issued = consumed via the usage log in this period · <strong style={{ color: 'var(--text-2)' }}>Closing = Opening + Received − Assigned</strong>. Issued is shown but not subtracted — stock has to be assigned before it can be consumed, so it already left the warehouse under Assigned. Only items with GRN history appear, and Closing will not always match the Inventory page. <strong style={{ color: 'var(--text-2)' }}>Condition</strong> is the warehouse's own grading of the row; <strong style={{ color: 'var(--text-2)' }}>Returned As</strong> is what the most recent approved RTN said when the stock came back — a row never returned shows neither.
      </div>
    </div>
  );
}