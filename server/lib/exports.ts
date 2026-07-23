/**
 * Excel (xlsx) and PDF export helpers for forecast plans, aging reports and SOA.
 * Uses exceljs and pdfkit (pure-JS, serverless-friendly).
 */
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export interface TableSpec {
  title: string;
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
