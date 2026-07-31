/**
 * PDF renderer for the Prime Products "STATEMENT OF ACCOUNT" — replicates the
 * uploaded sample layout: red headings, per-company statements, TOTAL AMOUNTS
 * table (zero-balance branches omitted), ANALYSIS per branch with zebra rows,
 * red overdue days, per-branch bank details and per-company page numbering.
 */
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GroupStatement, CompanyStatement, buildGroupSummary, fmtAmount, fmtDate } from "./statement";

const RED = "#C62828";
const BLACK = "#111111";
const GRAY = "#777777";
const ZEBRA = "#F5F5F5";
const LINE = "#333333";
const BLUE = "#1A56A0";

const M = 40; // page margin
const PW = 595.28; // A4 portrait width
const CW = PW - 2 * M; // content width

// Unicode fonts (Greek support). Bundled in server/assets; fall back to the
// built-in Helvetica if missing (e.g. stripped build).
function fontPath(name: string): string | null {
  const candidates = [
    join(process.cwd(), "server", "assets", name),
    join(import.meta.dirname ?? __dirname, "..", "assets", name),
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}
let FONT = "Helvetica";
let FONT_BOLD = "Helvetica-Bold";
function registerFonts(doc: PDFKit.PDFDocument) {
  const reg = fontPath("NotoSans-Regular.ttf");
  const bold = fontPath("NotoSans-Bold.ttf");
  if (reg && bold) {
    doc.registerFont("Body", reg);
    doc.registerFont("BodyBold", bold);
    FONT = "Body";
    FONT_BOLD = "BodyBold";
  } else {
    FONT = "Helvetica";
    FONT_BOLD = "Helvetica-Bold";
  }
}

export function buildStatementPdf(stmt: GroupStatement): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: M, size: "A4", bufferPages: true, autoFirstPage: false });
    registerFonts(doc);
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageRanges: { name: string; start: number; end: number }[] = [];
    let pageIndex = -1;
    const newPage = () => {
      doc.addPage();
      pageIndex++;
    };

    // ---- consolidated group summary cover page (only for multi-company groups) ----
    if (stmt.companies.length > 1) {
      renderCoverPage(doc, stmt, newPage);
    }

    // ---- continuous flow: companies follow one another, page break only when needed ----
    let first = true;
    for (const company of stmt.companies) {
      if (pageIndex === -1) {
        newPage();
        doc.y = M;
      } else if (!first || stmt.companies.length > 1) {
        // separator between statements (or after the cover page index)
        ensureSpace(doc, 170, newPage, () => (doc.y = M));
        if (doc.y > M + 2) {
          const sy = doc.y + 14;
          hline(doc, sy, LINE, 1.2);
          doc.x = M;
          doc.y = sy + 18;
        }
      }
      renderCompany(doc, company, stmt.date, newPage);
      first = false;
    }
    // use the real buffered page count — pdfkit may auto-add pages on text wrap
    const realRange = doc.bufferedPageRange();
    pageRanges.push({ name: stmt.groupName, start: realRange.start, end: realRange.start + realRange.count - 1 });

    // per-company page numbering in footer
    for (const range of pageRanges) {
      const count = range.end - range.start + 1;
      for (let p = range.start; p <= range.end; p++) {
        doc.switchToPage(p);
        // pdfkit auto-adds a page when text starts below (pageHeight - bottom margin);
        // zero the bottom margin while writing the footer to prevent phantom blank pages.
        const prevBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font(FONT).fontSize(8).fillColor(GRAY);
        doc.text(`${range.name} — Page ${p - range.start + 1} of ${count}`, M, 812, {
          width: CW,
          align: "right",
          lineBreak: false,
        });
        doc.page.margins.bottom = prevBottom;
      }
    }
    doc.flushPages();
    doc.end();
  });
}

function renderCompany(doc: PDFKit.PDFDocument, company: CompanyStatement, date: number, newPage: () => void) {
  renderHeader(doc, company, date);

  // ---- TOTAL AMOUNTS ----
  doc.moveDown(1);
  sectionTitle(doc, "TOTAL AMOUNTS");
  const cols = [150, 42, 66, 66, 66, 63, 62];
  const headers = ["Company", "Currency", "Balance", "Unpaid\nDocuments", "Overdue\nDocuments", "Upcoming\nWithin Month", "Upcoming\nNext Month"];
  let y = doc.y + 4;
  y = drawTableHeader(doc, y, cols, headers);
  for (const t of company.totals) {
    doc.font(FONT_BOLD).fontSize(7.5).fillColor(BLACK);
    const nameH = doc.heightOfString(t.branch.key.toUpperCase(), { width: cols[0] - 4 });
    const rowH = Math.max(18, nameH + 10);
    let x = M;
    doc.text(t.branch.key.toUpperCase(), x, y + 5, { width: cols[0] - 4 });
    x += cols[0];
    const vals = [t.branch.currency, fmtAmount(t.balance), fmtAmount(t.unpaid), fmtAmount(t.overdue), fmtAmount(t.upcomingWithinMonth), fmtAmount(t.upcomingNextMonth)];
    doc.font(FONT).fontSize(8);
    vals.forEach((v, i) => {
      doc.text(v, x, y + 5, { width: cols[i + 1] - 6, align: i === 0 ? "center" : "right" });
      x += cols[i + 1];
    });
    y += rowH;
    hline(doc, y, "#CCCCCC", 0.5);
  }
  doc.y = y + 10;

  // ---- ANALYSIS ----
  sectionTitle(doc, "ANALYSIS");
  for (const a of company.analyses) {
    ensureSpace(doc, 90, newPage, () => (doc.y = M + 10));
    // branch heading
    const hy = doc.y + 6;
    doc.font(FONT_BOLD).fontSize(11).fillColor(BLACK).text(a.branch.city, M, hy);
    doc.font(FONT_BOLD).fontSize(7.5);
    const dnH = doc.heightOfString(a.branch.displayName, { width: 320 });
    doc.text(a.branch.displayName, M + 95, hy + 3, { width: 320 });
    doc.font(FONT).fontSize(8).fillColor(BLACK).text(`currency: ${a.branch.currencySymbol}`, M, hy + 3, { width: CW, align: "right" });
    doc.y = hy + Math.max(18, dnH + 8);

    const acols = [60, 90, 60, 65, 50, 90, 100];
    const aheaders = ["Doc. Date", "Documents", "Doc.\nAmount", "Open Doc.\nAmount", "Overdue", "Vessel", "Comments"];
    let ay = drawTableHeader(doc, doc.y, acols, aheaders);
    let zebra = false;
    for (const r of a.rows) {
      const commentH = doc.heightOfString(r.comments || " ", { width: acols[6] - 6 });
      const rowH = Math.max(16, commentH + 8);
      if (ay + rowH > 780) {
        newPage();
        ay = drawTableHeader(doc, M + 10, acols, aheaders);
      }
      if (zebra) {
        doc.rect(M, ay, CW, rowH).fill(ZEBRA);
      }
      zebra = !zebra;
      doc.fillColor(BLACK).font(FONT).fontSize(7.5);
      let x = M;
      doc.text(fmtDate(r.docDate), x + 2, ay + 4, { width: acols[0] - 4 });
      x += acols[0];
      doc.font(FONT_BOLD).text(r.document, x + 2, ay + 4, { width: acols[1] - 4 });
      x += acols[1];
      doc.font(FONT).text(fmtAmount(r.docAmount), x, ay + 4, { width: acols[2] - 6, align: "right" });
      x += acols[2];
      doc.text(fmtAmount(r.openAmount), x, ay + 4, { width: acols[3] - 6, align: "right" });
      x += acols[3];
      doc.fillColor(r.overdueDays > 0 ? RED : GRAY).font(r.overdueDays > 0 ? FONT_BOLD : FONT);
      doc.text(String(r.overdueDays), x, ay + 4, { width: acols[4] - 6, align: "right" });
      doc.fillColor(BLACK).font(FONT);
      x += acols[4];
      doc.text(r.vessel, x + 2, ay + 4, { width: acols[5] - 4 });
      x += acols[5];
      doc.fontSize(6.5).text(r.comments, x + 2, ay + 4, { width: acols[6] - 6 });
      doc.fontSize(7.5);
      ay += rowH;
      hline(doc, ay, "#DDDDDD", 0.4);
    }
    // totals row
    if (ay + 18 > 780) {
      newPage();
      ay = M + 10;
    }
    doc.font(FONT_BOLD).fontSize(8).fillColor(BLACK);
    doc.text("TOTAL", M + 2, ay + 4, { width: acols[0] + acols[1] - 4 });
    doc.text(fmtAmount(a.totalDocAmount), M + acols[0] + acols[1], ay + 4, { width: acols[2] - 6, align: "right" });
    doc.text(fmtAmount(a.totalOpenAmount), M + acols[0] + acols[1] + acols[2], ay + 4, { width: acols[3] - 6, align: "right" });
    ay += 18;
    hline(doc, ay, LINE, 1);

    // bank details
    doc.y = ay + 4;
    doc.font(FONT_BOLD).fontSize(6).fillColor(BLACK).text("BANK DETAILS ", M, doc.y, { continued: true });
    doc.font(FONT).text(a.branch.bankDetails.join("  "), { width: CW });
    doc.y += 14;
  }
}

/** Shared brand block, top-right — identical on the cover and company pages. */
function renderBrandBlock(doc: PDFKit.PDFDocument) {
  doc.font(FONT_BOLD).fontSize(13).fillColor(GRAY).text("STATEMENT OF ACCOUNT", PW - M - 220, M, { width: 220, align: "right" });
  doc.font(FONT_BOLD).fontSize(11).fillColor(BLUE).text("PRIME PRODUCTS LTD", PW - M - 220, M + 16, { width: 220, align: "right" });
  doc.font(FONT).fontSize(7.5).fillColor(GRAY).text("Industrial Safety Products Representation & Distribution", PW - M - 220, M + 30, { width: 220, align: "right" });
}

function renderHeader(doc: PDFKit.PDFDocument, company: CompanyStatement, date: number) {
  // flow-relative header: renders wherever doc.y currently is
  const top = Math.max(doc.y, M);
  const atPageTop = top <= M + 12;
  if (atPageTop) renderBrandBlock(doc);

  // left: red kicker + big company name — same pattern as the cover page
  doc.font(FONT_BOLD).fontSize(12).fillColor(RED).text("COMPANY", M, top);
  doc.font(FONT_BOLD).fontSize(19).fillColor(BLACK);
  const nameW = atPageTop ? CW - 240 : CW;
  const nameH = doc.heightOfString(company.companyName.toUpperCase(), { width: nameW });
  doc.text(company.companyName.toUpperCase(), M, top + 16, { width: nameW });
  let y = top + 16 + nameH + 4;

  // meta line: Date | Payment Terms
  doc.font(FONT_BOLD).fontSize(9).fillColor(BLACK).text("Date: ", M, y, { continued: true });
  doc.font(FONT).text(fmtDate(date), { continued: true });
  doc.font(FONT_BOLD).text("   |   Payment Terms: ", { continued: true });
  doc.font(FONT).text(`${company.paymentTermsDays} days Credit / Πίστωση ${company.paymentTermsDays} ημερών`);
  y += 16;
  hline(doc, y, LINE, 1.2);
  doc.y = y + 6;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  // gray uppercase section label — same style as the cover page sections
  doc.font(FONT_BOLD).fontSize(11).fillColor(GRAY).text(title, M, doc.y + 8);
  doc.y += 4;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number, cols: number[], headers: string[]): number {
  doc.font(FONT_BOLD).fontSize(7.5).fillColor(BLACK);
  let x = M;
  const h = 26;
  headers.forEach((hd, i) => {
    doc.text(hd, x + 2, y + 3, { width: cols[i] - 4, align: i === 0 ? "left" : "center" });
    x += cols[i];
  });
  hline(doc, y, LINE, 1);
  hline(doc, y + h, LINE, 0.8);
  return y + h;
}

function hline(doc: PDFKit.PDFDocument, y: number, color: string, w: number) {
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(color).lineWidth(w).stroke();
}

// Currency box palette: [bg, accent] — EUR blue, AED amber, USD/SGD green, fallback gray
const CUR_COLORS: Record<string, [string, string]> = {
  EUR: ["#EBF2FA", "#1A56A0"],
  AED: ["#FDF6E3", "#8B6914"],
  SGD: ["#EAF6EE", "#1E7A3C"],
  USD: ["#EAF6EE", "#1E7A3C"],
};

function renderCoverPage(doc: PDFKit.PDFDocument, stmt: GroupStatement, newPage: () => void) {
  const summary = buildGroupSummary(stmt);
  newPage();

  // header: left = red kicker + group name; right = shared brand block
  renderBrandBlock(doc);

  doc.font(FONT_BOLD).fontSize(12).fillColor(RED).text("GROUP", M, M);
  doc.font(FONT_BOLD).fontSize(19).fillColor(BLACK);
  const nameH = doc.heightOfString(stmt.groupName.toUpperCase(), { width: CW - 240 });
  doc.text(stmt.groupName.toUpperCase(), M, M + 16, { width: CW - 240 });
  let y = M + 16 + nameH + 4;
  doc.font(FONT_BOLD).fontSize(9).fillColor(BLACK).text("Date: ", M, y, { continued: true });
  doc.font(FONT).text(fmtDate(stmt.date), { continued: true });
  doc.font(FONT_BOLD).text("   |   Total Companies: ", { continued: true });
  doc.font(FONT).text(String(stmt.companies.length));
  y += 16;
  hline(doc, y, LINE, 1.2);
  y += 16;

  // ---- currency total boxes ----
  doc.font(FONT_BOLD).fontSize(11).fillColor(GRAY).text("CONSOLIDATED GROUP EXPOSURE", M, y);
  y += 18;
  const boxes = summary.currencies;
  const gap = 10;
  const boxW = Math.min(170, (CW - gap * Math.max(boxes.length - 1, 0)) / Math.max(boxes.length, 1));
  const boxH = 58;
  let bx = M;
  for (const c of boxes) {
    const [bg, accent] = CUR_COLORS[c.currency] ?? ["#F2F2F2", "#555555"];
    doc.roundedRect(bx, y, boxW, boxH, 4).fill(bg);
    doc.font(FONT).fontSize(7.5).fillColor(GRAY).text(`TOTAL BALANCE (${c.currency})`, bx, y + 8, { width: boxW, align: "center" });
    doc.font(FONT_BOLD).fontSize(13).fillColor(accent).text(`${c.symbol} ${fmtAmount(c.balance)}`, bx, y + 20, { width: boxW, align: "center" });
    doc.font(FONT).fontSize(7.5).fillColor(GRAY).text(`Overdue: ${fmtAmount(c.overdue)}`, bx, y + 40, { width: boxW, align: "center" });
    bx += boxW + gap;
  }
  y += boxH + 20;

  // ---- company index table ----
  doc.font(FONT_BOLD).fontSize(11).fillColor(GRAY).text("COMPANY BREAKDOWN INDEX", M, y);
  y += 16;
  const curs = summary.currencies.map(c => c.currency);
  const nameW = Math.max(150, CW - curs.length * 80 - 80);
  const colW = (CW - nameW - 80) / Math.max(curs.length, 1);
  const headers = ["Company", ...curs.map(c => `${c} Balance`), "Overdue"];
  const widths = [nameW, ...curs.map(() => colW), 80];
  doc.font(FONT_BOLD).fontSize(8).fillColor(BLACK);
  hline(doc, y, LINE, 1);
  let hx = M;
  headers.forEach((h, i) => {
    doc.text(h, hx + 2, y + 4, { width: widths[i] - 4, align: i === 0 ? "left" : "right" });
    hx += widths[i];
  });
  y += 17;
  hline(doc, y, LINE, 0.8);
  let zebra = false;
  for (const row of summary.companies) {
    doc.font(FONT_BOLD).fontSize(7.5);
    const rowNameH = doc.heightOfString(row.companyName.toUpperCase(), { width: nameW - 4 });
    const rowH = Math.max(16, rowNameH + 8);
    if (y + rowH > 780) {
      newPage();
      y = M + 10;
      zebra = false;
    }
    if (zebra) doc.rect(M, y, CW, rowH).fill(ZEBRA);
    zebra = !zebra;
    doc.font(FONT_BOLD).fontSize(7.5).fillColor(BLACK);
    doc.text(row.companyName.toUpperCase(), M + 2, y + 4, { width: nameW - 4 });
    let cx = M + nameW;
    doc.font(FONT).fontSize(8);
    for (const cur of curs) {
      const v = row.balances.get(cur) ?? 0;
      doc.text(v === 0 ? "—" : fmtAmount(v), cx, y + 4, { width: colW - 6, align: "right" });
      cx += colW;
    }
    // overdue column: amounts differ per currency — list non-zero ones
    const odParts = curs.filter(c => (row.overdue.get(c) ?? 0) !== 0).map(c => fmtAmount(row.overdue.get(c)!));
    doc.fillColor(odParts.length ? RED : GRAY).font(odParts.length ? FONT_BOLD : FONT).fontSize(7.5);
    doc.text(odParts.length ? odParts.join(" / ") : "—", cx, y + 4, { width: 80 - 6, align: "right" });
    doc.fillColor(BLACK);
    y += rowH;
    hline(doc, y, "#DDDDDD", 0.4);
  }
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number, newPage: () => void, after?: () => void) {
  if (doc.y + needed > 780) {
    newPage();
    doc.y = M + 10;
    if (after) after();
  }
}
