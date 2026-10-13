import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

/**
 * PDF do contrato para o Autentique (D-AUTENTIQUE): o mesmo texto preenchido que a creator leria no portal, em A4,
 * Helvetica, com quebra de linha e de página. Caractere que a fonte não tem vira "?" (ex.: emoji).
 */
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;
const SIZE = 10.5;
const LEADING = 15;

function safe(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of text.replace(/\t/g, "    ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, size: number, text: string, width: number): string[] {
  const words = text.split(/ +/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  lines.push(line);
  return lines;
}

export async function contractPdf(title: string, body: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = A4.w - MARGIN * 2;
  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;
  const ensure = (h: number) => {
    if (y - h < MARGIN) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - MARGIN;
    }
  };
  for (const l of wrap(bold, 13, safe(bold, title), width)) {
    ensure(20);
    page.drawText(l, { x: MARGIN, y, size: 13, font: bold });
    y -= 20;
  }
  y -= 8;
  for (const para of body.split(/\r?\n/)) {
    if (!para.trim()) {
      y -= LEADING * 0.6;
      continue;
    }
    for (const l of wrap(font, SIZE, safe(font, para.trim()), width)) {
      ensure(LEADING);
      page.drawText(l, { x: MARGIN, y, size: SIZE, font });
      y -= LEADING;
    }
  }
  return doc.save();
}
