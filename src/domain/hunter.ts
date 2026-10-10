/**
 * Link do hunter (D-HUNTERLINK). Cada hunter tem um código curto (letras minúsculas e números) por marca; o link
 * `/f/[marca]/[formulario]/[codigo]` abre o Google Forms com a pergunta "Código de quem te convidou" já preenchida.
 * O link pré-preenchido do formulário é gravado com a palavra CODIGO no lugar do código.
 */

export const HUNTER_FORMS = ["hunter", "captacao"] as const;
export type HunterForm = (typeof HUNTER_FORMS)[number];

export function isHunterForm(v: string): v is HunterForm {
  return (HUNTER_FORMS as readonly string[]).includes(v);
}

/** Código como a pessoa digitou ou veio no formulário → forma gravada (sem acento, minúsculas, só letras e números). */
export function normalizeHunterCode(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
}

/** Sugestão de código a partir do nome (primeiro nome). */
export function hunterCodeFrom(name: string): string {
  return normalizeHunterCode(name.trim().split(/\s+/)[0] ?? "");
}

export function isValidHunterCode(code: string): boolean {
  return /^[a-z0-9]{2,20}$/.test(code);
}

/** Link pré-preenchido do Google Forms com CODIGO no lugar do código (o que a equipe cola no painel). */
export function isValidFormTemplate(url: string): boolean {
  return /^https:\/\/docs\.google\.com\/forms\/\S+$/.test(url) && url.includes("CODIGO");
}

/** Link final do formulário para o hunter (sem código: formulário sem a pergunta preenchida). */
export function formUrlFor(template: string, code: string | null): string {
  return template.replace("CODIGO", code ? encodeURIComponent(code) : "");
}
