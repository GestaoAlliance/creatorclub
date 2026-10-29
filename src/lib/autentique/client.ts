/**
 * Cliente da API v2 do Autentique (D-AUTENTIQUE): GraphQL em https://api.autentique.com.br/v2/graphql, com a chave da
 * conta da marca no cabeçalho `Authorization: Bearer`. Criar documento vai em multipart (especificação "GraphQL
 * multipart request": `operations`, `map` e o arquivo). Só no servidor.
 */
export const AUTENTIQUE_URL = "https://api.autentique.com.br/v2/graphql";

export class AutentiqueError extends Error {}

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string | FormData }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const defaultFetch: Fetcher = (url, init) => fetch(url, init);

async function parse<T>(res: Awaited<ReturnType<Fetcher>>): Promise<T> {
  const body = await res.text();
  let json: { data?: T; errors?: { message?: string }[] } = {};
  try {
    json = JSON.parse(body);
  } catch {
    throw new AutentiqueError(`Autentique respondeu ${res.status} sem JSON.`);
  }
  if (res.status === 401 || res.status === 403) throw new AutentiqueError("Chave do Autentique recusada (confira a chave da API).");
  if (json.errors?.length) throw new AutentiqueError(`Autentique: ${json.errors.map((e) => e.message ?? "erro").join("; ")}`);
  if (!res.ok || !json.data) throw new AutentiqueError(`Autentique respondeu ${res.status}.`);
  return json.data;
}

export async function autentiqueQuery<T>(token: string, query: string, variables: Record<string, unknown> = {}, fetcher: Fetcher = defaultFetch): Promise<T> {
  const res = await fetcher(AUTENTIQUE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return parse<T>(res);
}

/** Conta dona da chave (para "testar conexão"). */
export async function autentiqueMe(token: string, fetcher?: Fetcher): Promise<{ id: string; name: string | null; email: string | null }> {
  const data = await autentiqueQuery<{ me: { id: string; name: string | null; email: string | null } }>(token, "query { me { id name email } }", {}, fetcher);
  return data.me;
}

const CREATE = `mutation createDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!, $sandbox: Boolean) {
  createDocument(document: $document, signers: $signers, file: $file, sandbox: $sandbox) { id name signatures { public_id email action { name } link { short_link } } }
}`;

/**
 * Envia o PDF para assinatura: o Autentique manda o e-mail para cada signatário. Devolve o id do documento e o link
 * de assinatura do primeiro signatário (para mandar também pelo WhatsApp, D-AUTENTIQUE2).
 */
export async function createAutentiqueDocument(
  token: string,
  input: { name: string; message: string; pdf: Uint8Array; fileName: string; signers: { name: string; email: string }[]; sandbox: boolean },
  fetcher: Fetcher = defaultFetch,
): Promise<{ id: string; signLink: string | null }> {
  const form = new FormData();
  form.append(
    "operations",
    JSON.stringify({
      query: CREATE,
      variables: {
        document: { name: input.name, message: input.message, refusable: true },
        signers: input.signers.map((s) => ({ name: s.name, email: s.email, action: "SIGN" })),
        file: null,
        sandbox: input.sandbox,
      },
    }),
  );
  form.append("map", JSON.stringify({ file: ["variables.file"] }));
  form.append("file", new Blob([input.pdf as BlobPart], { type: "application/pdf" }), input.fileName);
  const res = await fetcher(AUTENTIQUE_URL, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  type Raw = { createDocument: { id: string; signatures?: { action: { name: string } | null; link: { short_link: string | null } | null }[] | null } };
  const data = await parse<Raw>(res);
  const signer = data.createDocument.signatures?.find((s) => s.action !== null && s.link?.short_link);
  return { id: data.createDocument.id, signLink: signer?.link?.short_link ?? null };
}

/** Cancela o documento ainda não assinado (recusa da candidata pela equipe ou contrato reenviado). */
export async function deleteAutentiqueDocument(token: string, id: string, fetcher: Fetcher = defaultFetch): Promise<void> {
  await autentiqueQuery<{ deleteDocument: boolean }>(token, "mutation deleteDocument($id: UUID!) { deleteDocument(id: $id) }", { id }, fetcher);
}

export type AutentiqueSignature = { email: string | null; signedAt: string | null; rejectedAt: string | null; rejectReason: string | null };

const DOCUMENT = `query document($id: UUID!) {
  document(id: $id) { id files { signed } signatures { email action { name } signed { created_at } rejected { created_at reason } } }
}`;

/** Situação de cada assinatura do documento (quem assinou, quem recusou) e o link do PDF assinado. */
export async function getAutentiqueDocument(
  token: string,
  id: string,
  fetcher: Fetcher = defaultFetch,
): Promise<{ id: string; signedFileUrl: string | null; signatures: AutentiqueSignature[] }> {
  type Raw = {
    document: {
      id: string;
      files: { signed: string | null } | null;
      signatures: { email: string | null; action: { name: string } | null; signed: { created_at: string } | null; rejected: { created_at: string; reason: string | null } | null }[];
    } | null;
  };
  const data = await autentiqueQuery<Raw>(token, DOCUMENT, { id }, fetcher);
  if (!data.document) throw new AutentiqueError("Documento não encontrado no Autentique.");
  return {
    id: data.document.id,
    signedFileUrl: data.document.files?.signed ?? null,
    signatures: data.document.signatures
      // O autor do documento aparece como assinatura sem ação; só contam os signatários de verdade.
      .filter((s) => s.action !== null)
      .map((s) => ({ email: s.email, signedAt: s.signed?.created_at ?? null, rejectedAt: s.rejected?.created_at ?? null, rejectReason: s.rejected?.reason ?? null })),
  };
}
