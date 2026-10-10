import { extractText, getDocumentProxy } from "unpdf";

/** Texto do PDF da nota (D-NFCHECK). PDF sem texto (foto, escaneado) ou que não abre devolve "" e vai para conferência manual. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return "";
  }
}
