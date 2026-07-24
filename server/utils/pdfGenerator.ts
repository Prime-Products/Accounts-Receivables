import puppeteer from "puppeteer";
import handlebars from "handlebars";
import fs from "fs/promises";
import path from "path";

export async function generatePdfFromHtml(templatePath: string, data: any): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  const htmlTemplate = await fs.readFile(templatePath, "utf-8");
  const template = handlebars.compile(htmlTemplate);
  const content = template(data);

  await page.setContent(content, { waitUntil: "load" });
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

  await browser.close();
  return pdfBuffer as Buffer;
}
