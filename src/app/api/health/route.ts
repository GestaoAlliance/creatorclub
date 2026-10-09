// Liveness: só confirma que o app responde. A checagem de banco fica em /api/ready;
// fila e sincronização entram lá quando existirem (E3).
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ ok: true, app: "creator-club", time: new Date().toISOString() });
}
