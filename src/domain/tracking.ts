/**
 * Rastreio dos envios (D-TRACKING): transportadoras da lista de "Marcar enviado" e o link de cada código. Correios abre
 * no site dos Correios; as outras (e código fora do formato dos Correios), no Melhor Rastreio, que rastreia todas.
 */
export const CARRIERS = ["Correios", "Jadlog", "Loggi", "Melhor Envio"] as const;

export function trackingUrl(carrier: string | null, code: string | null): string | null {
  const c = (code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!c) return null;
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c) && (!carrier || /correios/i.test(carrier))) return `https://rastreamento.correios.com.br/app/index.php?objeto=${c}`;
  return `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(c)}`;
}
