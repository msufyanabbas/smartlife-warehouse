import type jsPDF from 'jspdf';
import { format } from 'date-fns';

/**
 * The shared chrome for a landscape report PDF — logo, company line, meta box,
 * generated stamp, title bar, accent strip, stat boxes and page footer.
 *
 * Lifted out of the stock report so the Issued Items report prints on the same
 * stationery rather than a near-copy of it: the two exports sit one tab apart
 * and any drift between them reads as two different documents. The layout
 * mirrors the on-screen printed forms (see PrintDocument.tsx) — same ink, same
 * tinted box, same purple/cyan strip.
 *
 * Everything is laid out from `marginL` and `contentW`, so every band on the
 * page shares both edges exactly. Callers size their table columns to sum to
 * `contentW` for the same reason.
 */

/** Where the page's own geometry ended up, so callers lay their bands on the same edges. */
export interface ReportChrome {
  pageW: number;
  pageH: number;
  marginL: number;
  marginR: number;
  /** Usable width — 269mm on landscape A4 at the 14mm margins. */
  contentW: number;
  /** Y immediately under the accent strip: where the first band of content starts. */
  contentY: number;
}

/** One line in the tinted box at the top right. Two are expected; the box is sized for two. */
export interface ReportMetaLine {
  label: string;
  value: string;
}

export interface ReportStat {
  label: string;
  value: string;
  color: [number, number, number];
}

const MARGIN = 14;

/**
 * Draws everything above the content and returns the page geometry.
 *
 * Async only because of the logo: it is fetched and base64'd, and a failure to
 * load is swallowed — a report without its logo is still a usable report, and
 * the company line shifts up to take the space.
 */
export async function drawReportChrome(
  doc: jsPDF,
  { title, meta }: { title: string; meta: [ReportMetaLine, ReportMetaLine] },
): Promise<ReportChrome> {
  const pageW = doc.internal.pageSize.width;        // 297mm
  const pageH = doc.internal.pageSize.height;       // 210mm
  const marginL = MARGIN;
  const marginR = MARGIN;
  const contentW = pageW - marginL - marginR;       // 269mm

  // ── Logo ──
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
  const nameY = logoAdded ? 27 : 14;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 26, 62);
  doc.text('SMART LIFE CONTRACTING COMPANY', marginL, nameY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text('WAREHOUSE & INVENTORY MANAGEMENT', marginL, nameY + 4);

  // ── Meta box (top right) ──
  // The two lines stack rather than run together: a single "01 Aug 2026 →
  // 04 Aug 2026" run is wider than the box at any weight worth reading.
  const boxW = 75, boxH = 26, boxX = pageW - marginR - boxW, boxY = 8;
  doc.setFillColor(240, 240, 248);
  doc.setDrawColor(224, 224, 239);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

  meta.forEach((line, index) => {
    const lineY = boxY + 6 + index * 10;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(line.label, boxX + boxW - 4, lineY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 62);
    doc.text(line.value, boxX + boxW - 4, lineY + 5, { align: 'right' });
  });

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
  doc.text(title, marginL + contentW / 2, titleY + 6.2, { align: 'center' });

  // ── Two-color accent strip ──
  const stripY = titleY + 9;
  const stripW = contentW / 2;
  doc.setFillColor(107, 47, 217);  // Purple
  doc.rect(marginL, stripY, stripW, 2.5, 'F');
  doc.setFillColor(0, 194, 255);   // Cyan
  doc.rect(marginL + stripW, stripY, stripW, 2.5, 'F');

  return { pageW, pageH, marginL, marginR, contentW, contentY: stripY + 2.5 };
}

/**
 * The summary boxes under the strip. Returns the Y they end at.
 *
 * Drawn as one rectangle across the full content width with dividers ruled in,
 * rather than as abutting rectangles — those double-strike their shared edges,
 * which is what reads as a gap.
 */
export function drawStatBoxes(
  doc: jsPDF,
  chrome: ReportChrome,
  y: number,
  stats: ReportStat[],
): number {
  const { marginL, contentW } = chrome;
  const statsH = 14;
  const statW = contentW / stats.length;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(229, 231, 235);
  doc.rect(marginL, y, contentW, statsH, 'FD');
  for (let i = 1; i < stats.length; i++) {
    doc.line(marginL + i * statW, y, marginL + i * statW, y + statsH);
  }

  stats.forEach((stat, i) => {
    const sx = marginL + i * statW;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(stat.label, sx + statW / 2, y + 4.5, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...stat.color);
    doc.text(stat.value, sx + statW / 2, y + 11, { align: 'center' });
  });

  return y + statsH;
}

/** The per-page footer, for autoTable's `didDrawPage`. */
export function drawReportFooter(doc: jsPDF, chrome: ReportChrome, pageNumber: number) {
  const { pageW, pageH, marginL, marginR } = chrome;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text('Smart Life Contracting Company — Confidential', marginL, pageH - 6);
  doc.text(
    `Page ${pageNumber} of ${doc.getNumberOfPages()}`,
    pageW - marginR,
    pageH - 6,
    { align: 'right' },
  );
}
