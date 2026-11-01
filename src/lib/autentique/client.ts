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
  type Raw = { createDocument: { id: string; signatures?: { public_id?: string; action: { name: string } | null; link: { short_link: string | null } | null }[] | null } };
  const data = await parse<Raw>(res);
  const signers = (data.createDocument.signatures ?? []).filter((s) => s.action !== null);
  const ready = signers.find((s) => s.link?.short_link)?.link?.short_link ?? null;
  // Quem recebe por e-mail vem sem link: o link de assinatura é pedido à parte (para o WhatsApp e o portal).
  const signLink = ready ?? (signers[0]?.public_id ? await createSignLink(token, signers[0].public_id, fetcher).catch(() => null) : null);
  return { id: data.createDocument.id, signLink };
}

/** Link de assinatura de um signatário (o Autentique só cria quando é pedido). */
export async function createSignLink(token: string, publicId: string, fetcher: Fetcher = defaultFetch): Promise<string | null> {
  const data = await autentiqueQuery<{ createLinkToSignature: { short_link: string | null } | null }>(
    token,
    "mutation createLinkToSignature($public_id: UUID!) { createLinkToSignature(public_id: $public_id) { short_link } }",
    { public_id: publicId },
    fetcher,
  );
  return data.createLinkToSignature?.short_link ?? null;
}

/** Cancela o documento ainda não assinado (recusa da candidata pela equipe ou contrato reenviado). */
export async function deleteAutentiqueDocument(token: string, id: string, fetcher: Fetcher = defaultFetch): Promise<void> {
  await autentiqueQuery<{ deleteDocument: boolean }>(token, "mutation deleteDocument($id: UUID!) { deleteDocument(id: $id) }", { id }, fetcher);
}

export type AutentiqueSignature = { publicId: string | null; email: string | null; signedAt: string | null; rejectedAt: string | null; rejectReason: string | null; link: string | null };

const DOCUMENT = `query document($id: UUID!) {
  document(id: $id) { id files { signed } signatures { public_id email action { name } link { short_link } signed { created_at } rejected { created_at reason } } }
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
      signatures: { public_id?: string; email: string | null; action: { name: string } | null; link?: { short_link: string | null } | null; signed: { created_at: string } | null; rejected: { created_at: string; reason: string | null } | null }[];
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
      .map((s) => ({ publicId: s.public_id ?? null, email: s.email, signedAt: s.signed?.created_at ?? null, rejectedAt: s.rejected?.created_at ?? null, rejectReason: s.rejected?.reason ?? null, link: s.link?.short_link ?? null })),
  };
}
