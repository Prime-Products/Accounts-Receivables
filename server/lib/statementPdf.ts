/**
 * PDF renderer for the Prime Products "STATEMENT OF ACCOUNT" — replicates the
 * uploaded sample layout: red headings, per-company statements, TOTAL AMOUNTS
 * table (zero-balance branches omitted), ANALYSIS per branch with zebra rows,
 * red overdue days, per-branch bank details and per-company page numbering.
 */
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GroupStatement, CompanyStatement, fmtAmount, fmtDate } from "./statement";

const RED = "#C62828";
const BLACK = "#111111";
const GRAY = "#777777";
const ZEBRA = "#F5F5F5";
const LINE = "#333333";

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

    for (const company of stmt.companies) {
      const start = pageIndex + 1;
      renderCompany(doc, company, stmt.date, newPage);
      pageRanges.push({ name: company.companyName, start, end: pageIndex });
    }

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
  newPage();
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
    ensureSpace(doc, 90, newPage);
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

function renderHeader(doc: PDFKit.PDFDocument, company: CompanyStatement, date: number) {
  // Brand (text-based logo block, top-right)
  doc.font(FONT_BOLD).fontSize(16).fillColor(BLACK).text("PRIME", PW - M - 130, M, { width: 130, align: "right" });
  doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY).text("P R O D U C T S", PW - M - 130, M + 18, { width: 130, align: "right" });
  // Title
  doc.font(FONT_BOLD).fontSize(18).fillColor(RED).text("STATEMENT OF ACCOUNT", M, M + 6, { width: CW - 140 });
  doc.y = M + 40;

  // company / date / payment terms header row
  const y0 = doc.y;
  hline(doc, y0, LINE, 1);
  doc.font(FONT_BOLD).fontSize(7.5).fillColor(BLACK);
  doc.text("COMPANY", M, y0 + 4);
  doc.text("DATE", M + 280, y0 + 4);
  doc.text("PAYMENT TERMS", M + 380, y0 + 4);
  hline(doc, y0 + 16, LINE, 0.5);
  doc.font(FONT_BOLD).fontSize(8.5);
  const nameH2 = doc.heightOfString(company.companyName.toUpperCase(), { width: 270 });
  doc.text(company.companyName.toUpperCase(), M, y0 + 20, { width: 270 });
  doc.font(FONT).text(fmtDate(date), M + 280, y0 + 20);
  const terms = `${company.paymentTermsDays} days Credit / Πίστωση ${company.paymentTermsDays} ημερών`;
  const termsH = doc.heightOfString(terms, { width: 140 });
  doc.text(terms, M + 380, y0 + 20, { width: 140 });
  const rowBottom = y0 + 20 + Math.max(16, nameH2 + 4, termsH + 4);
  hline(doc, rowBottom, LINE, 1);
  doc.y = rowBottom + 4;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.font(FONT_BOLD).fontSize(14).fillColor(RED).text(title, M, doc.y + 6);
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

function ensureSpace(doc: PDFKit.PDFDocument, needed: number, newPage: () => void) {
  if (doc.y + needed > 780) {
    newPage();
    doc.y = M + 10;
  }
}
