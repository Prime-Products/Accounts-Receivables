/**
 * Excel (xlsx) and PDF export helpers for forecast plans, aging reports and SOA.
 * Uses exceljs and pdfkit (pure-JS, serverless-friendly).
 */
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface TableSpec {
  title: string;
  kind?: "soa";
  companyName?: string;
  paymentTermsDays?: number;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, string | number>[];
}

export async function buildExcel(spec: TableSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spec.title.slice(0, 31));
  ws.columns = spec.columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  ws.getRow(1).font = { bold: true };
  for (const row of spec.rows) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function buildPdf(spec: TableSpec): Promise<Buffer> {
  if (spec.kind === "soa") return buildSoaPdf(spec);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: spec.columns.length > 5 ? "landscape" : "portrait" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).font("Helvetica-Bold").text(spec.title);
    doc.moveDown(0.5);
    doc.fontSize(9).font("Helvetica").fillColor("#666").text(`Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
    doc.moveDown(1);

    const pageWidth = doc.page.width - 80;
    const colWidth = pageWidth / spec.columns.length;
    let y = doc.y;

    const drawRow = (values: (string | number)[], bold = false) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
      }
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#111");
      values.forEach((v, i) => {
        doc.text(String(v), 40 + i * colWidth, y, { width: colWidth - 6, ellipsis: true });
      });
      y += 18;
      doc.moveTo(40, y - 4).lineTo(40 + pageWidth, y - 4).strokeColor("#ddd").lineWidth(0.5).stroke();
    };

    drawRow(spec.columns.map(c => c.header), true);
    for (const row of spec.rows) drawRow(spec.columns.map(c => row[c.key] ?? ""));
    doc.end();
  });
}

const FONT_PATHS = [
  ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  ["/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"],
] as const;
const BRAND_BLUE = "#1e2f46";
const BRAND_RED = "#d52f39";

function soaFonts(doc: PDFKit.PDFDocument) {
  const configured = process.env.PDF_FONT_PATH;
  let packaged: readonly [string, string] | undefined;
  try {
    packaged = [
      require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
      require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"),
    ];
  } catch {
    // System font paths remain a safe fallback for older deployments.
  }
  const pair = configured && existsSync(configured)
    ? [configured, process.env.PDF_FONT_BOLD_PATH ?? configured]
    : packaged ?? FONT_PATHS.find(([regular, bold]) => existsSync(regular) && existsSync(bold));
  if (!pair) return { regular: "Helvetica", bold: "Helvetica-Bold" };
  doc.registerFont("SoaRegular", pair[0]);
  doc.registerFont("SoaBold", pair[1]);
  return { regular: "SoaRegular", bold: "SoaBold" };
}

function europeanAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("el-GR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function buildSoaPdf(spec: TableSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4", layout: "portrait" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fonts = soaFonts(doc);
    const rows = spec.rows.filter(row =>
      String(row.company ?? row.invoice ?? "").toUpperCase() !== "TOTAL",
    );
    const pageLeft = 48;
    const pageRight = doc.page.width - 48;
    const pageWidth = pageRight - pageLeft;
    const now = new Date();
    const endOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1;
    const endOfNextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1) - 1;
    const groupName =
      spec.companyName ??
      spec.title.replace(/^Statement of Account — (?:Group )?/, "").replace(/\s+\([^)]*\)$/, "");

    const amountFor = (row: Record<string, string | number>, key: string) =>
      Number(row[key] ?? 0) || 0;
    const branchTotals = new Map<string, {
      currency: string;
      balance: number;
      overdue: number;
      currentMonth: number;
      nextMonth: number;
    }>();
    for (const row of rows) {
      const branch = String(row.branch ?? "PRIME PRODUCTS LTD");
      const total = branchTotals.get(branch) ?? {
        currency: String(row.cur ?? "EUR"),
        balance: 0,
        overdue: 0,
        currentMonth: 0,
        nextMonth: 0,
      };
      const open = amountFor(row, "outOrig");
      const due = Date.parse(String(row.due ?? ""));
      total.balance += open;
      if (amountFor(row, "days") > 0) total.overdue += open;
      else if (due <= endOfMonth) total.currentMonth += open;
      else if (due <= endOfNextMonth) total.nextMonth += open;
      branchTotals.set(branch, total);
    }

    const drawBrandHeader = () => {
      doc.fillColor(BRAND_RED).font(fonts.bold).fontSize(11).text("COMPANY", pageLeft, 54);
      const companyWidth = pageWidth * 0.58;
      let companyFontSize = 20;
      while (companyFontSize > 13) {
        doc.font(fonts.bold).fontSize(companyFontSize);
        if (doc.widthOfString(groupName) <= companyWidth) break;
        companyFontSize -= 0.5;
      }
      doc.fillColor(BRAND_BLUE).fontSize(companyFontSize).text(groupName, pageLeft, 72, {
        width: companyWidth,
        height: 28,
        ellipsis: true,
        lineBreak: false,
      });
      doc.fillColor("#6b7280").fontSize(12).text("STATEMENT OF ACCOUNT", pageLeft + pageWidth * 0.58, 55, {
        width: pageWidth * 0.42,
        align: "right",
      });
      doc.fillColor(BRAND_BLUE).fontSize(12).text("PRIME PRODUCTS LTD", pageLeft + pageWidth * 0.58, 74, {
        width: pageWidth * 0.42,
        align: "right",
      });
      doc.fillColor("#6b7280").font(fonts.regular).fontSize(8)
        .text("Industrial Safety Products Representation & Distribution", pageLeft + pageWidth * 0.48, 91, {
          width: pageWidth * 0.52,
          align: "right",
        });
      doc.fillColor(BRAND_BLUE).font(fonts.bold).fontSize(9)
        .text(
          `Date: ${now.toLocaleDateString("el-GR")}   |   Payment Terms: ${spec.paymentTermsDays ?? 30} days Credit / Πίστωση ${spec.paymentTermsDays ?? 30} ημερών`,
          pageLeft,
          112,
        );
      doc.moveTo(pageLeft, 128).lineTo(pageRight, 128).strokeColor(BRAND_BLUE).lineWidth(1).stroke();
      doc.y = 150;
    };

    const ensureSpace = (height: number) => {
      if (doc.y + height <= doc.page.height - 48) return;
      doc.addPage();
      drawBrandHeader();
    };

    drawBrandHeader();
    doc.fillColor("#6b7280").font(fonts.bold).fontSize(12).text("TOTAL AMOUNTS");
    doc.moveDown(0.5);
    const summaryColumns = [
      { label: "Company", width: 163, align: "left" as const },
      { label: "Currency", width: 44, align: "center" as const },
      { label: "Balance", width: 59, align: "right" as const },
      { label: "Unpaid\nDocuments", width: 59, align: "right" as const },
      { label: "Overdue\nDocuments", width: 59, align: "right" as const },
      { label: "Upcoming\nWithin Month", width: 59, align: "right" as const },
      { label: "Upcoming\nNext Month", width: 56, align: "right" as const },
    ];
    let y = doc.y;
    doc.moveTo(pageLeft, y).lineTo(pageRight, y).strokeColor(BRAND_BLUE).stroke();
    y += 8;
    let x = pageLeft;
    for (const column of summaryColumns) {
      doc.fillColor(BRAND_BLUE).font(fonts.bold).fontSize(6.4)
        .text(column.label, x, y, {
          width: column.width,
          height: 22,
          align: column.label === "Company" ? "left" : "center",
          lineGap: -1,
        });
      x += column.width;
    }
    y += 28;
    for (const [branch, total] of branchTotals) {
      x = pageLeft;
      const values = [
        branch,
        total.currency,
        europeanAmount(total.balance),
        europeanAmount(total.balance),
        europeanAmount(total.overdue),
        europeanAmount(total.currentMonth),
        europeanAmount(total.nextMonth),
      ];
      values.forEach((value, index) => {
        const column = summaryColumns[index];
        doc.fillColor(BRAND_BLUE).font(index === 0 ? fonts.bold : fonts.regular).fontSize(8)
          .text(value, x, y, { width: column.width, align: column.align });
        x += column.width;
      });
      y += 20;
      doc.moveTo(pageLeft, y - 5).lineTo(pageRight, y - 5).strokeColor("#d1d5db").lineWidth(0.5).stroke();
    }
    doc.y = y + 20;

    const detailColumns = [
      { key: "issue", label: "Doc. Date", width: 58, align: "left" as const },
      { key: "invoice", label: "Documents", width: 92, align: "left" as const },
      { key: "amount", label: "Doc.\nAmount", width: 64, align: "right" as const },
      { key: "outOrig", label: "Open Doc.\nAmount", width: 64, align: "right" as const },
      { key: "days", label: "Overdue", width: 56, align: "right" as const },
      { key: "vessel", label: "Vessel", width: 78, align: "left" as const },
      { key: "comments", label: "Comments", width: 87, align: "left" as const },
    ];
    for (const [branch, total] of branchTotals) {
      const branchRows = rows.filter(row => String(row.branch ?? "PRIME PRODUCTS LTD") === branch);
      ensureSpace(90);
      doc.fillColor("#6b7280").font(fonts.bold).fontSize(12).text("ANALYSIS", pageLeft);
      doc.moveDown(0.6);
      const normalizedBranch = branch.toUpperCase();
      const branchHeading = normalizedBranch === "PRIME PRODUCTS LTD" ? "PIRAEUS" : normalizedBranch;
      const branchDescription = normalizedBranch === "PRIME PRODUCTS LTD"
        ? "PRIME PRODUCTS LTD (REPRESENTATION DISTRIBUTION OF INDUSTRIAL SAFETY PRODUCTS)"
        : normalizedBranch;
      const headingY = doc.y;
      doc.fillColor(BRAND_BLUE).font(fonts.bold).fontSize(10)
        .text(branchHeading, pageLeft, headingY, { width: 110 });
      doc.fontSize(7.2).text(branchDescription, pageLeft + 110, headingY, {
        width: pageWidth - 200,
        height: 24,
        lineGap: -1,
      });
      doc.font(fonts.regular).fontSize(8).text(`currency: ${total.currency === "EUR" ? "€" : total.currency}`, pageRight - 90, headingY, {
        width: 90,
        align: "right",
      });
      y = headingY + 30;
      doc.moveTo(pageLeft, y).lineTo(pageRight, y).strokeColor(BRAND_BLUE).stroke();
      y += 7;
      x = pageLeft;
      for (const column of detailColumns) {
        doc.fillColor(BRAND_BLUE).font(fonts.bold).fontSize(6.8).text(column.label, x, y, {
          width: column.width - 10,
          height: 22,
          align: column.align,
          lineGap: -1,
        });
        x += column.width;
      }
      y += 28;
      branchRows.forEach((row, rowIndex) => {
        if (y > doc.page.height - 65) {
          doc.addPage();
          drawBrandHeader();
          y = doc.y;
        }
        if (rowIndex % 2 === 1) doc.rect(pageLeft, y - 3, pageWidth, 18).fill("#f3f4f6");
        x = pageLeft;
        for (const column of detailColumns) {
          let value: string | number = row[column.key] ?? "";
          if (["amount", "outOrig"].includes(column.key)) value = europeanAmount(value);
          if (column.key === "issue" && value) {
            const date = new Date(String(value));
            value = `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`;
          }
          doc.fillColor(column.key === "days" && Number(value) > 0 ? BRAND_RED : BRAND_BLUE)
            .font(column.key === "invoice" ? fonts.bold : fonts.regular)
            .fontSize(7.5)
            .text(String(value), x, y, { width: column.width - 4, align: column.align, ellipsis: true });
          x += column.width;
        }
        y += 18;
      });
      doc.y = y + 18;
    }
    doc.end();
  });
}
