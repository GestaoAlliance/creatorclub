/** PDF mínimo com uma linha de texto por item (Helvetica, WinAnsi), para testar a leitura da nota sem dados reais. */
export function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = `BT /F1 9 Tf 40 800 Td 11 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/** Linhas no formato do DANFSe v2.0 (dados fictícios). */
export function danfseLines(o: { key: string; issuer: string; taker: string; amount: string; code?: string | undefined }): string[] {
  return [
    "DANFSe v2.0",
    "CHAVE DE ACESSO DA NFS-e",
    o.key,
    "PRESTADOR / FORNECEDOR CNPJ / CPF / NIF",
    o.issuer,
    "TOMADOR / ADQUIRENTE CNPJ / CPF / NIF",
    o.taker,
    "SERVIÇO PRESTADO Código de Tributação Nacional/Municipal",
    o.code ?? "17.06.01 / 001",
    "VALOR TOTAL DA NFS-e VALOR DA OPERAÇÃO / SERVIÇO",
    o.amount,
  ];
}
