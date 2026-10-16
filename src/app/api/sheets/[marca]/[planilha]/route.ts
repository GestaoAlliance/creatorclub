export const dynamic = "force-dynamic";

// Ligação por script na planilha desligada (D-SHEETREADONLY): o sistema nunca escreve nas planilhas da equipe.
// A leitura passa a ser feita pelo próprio sistema, só leitura. Um script antigo que ainda chame aqui recebe 410.

function gone(): Response {
  return Response.json({ ok: false, error: "Ligação por script desligada: o sistema só lê as planilhas." }, { status: 410 });
}

export async function POST(): Promise<Response> {
  return gone();
}

export async function GET(): Promise<Response> {
  return gone();
}
