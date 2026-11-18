import { redirect } from "next/navigation";

// D-PAYFLOW: a tela de Saques virou Pagamentos CNPJ/CPF (NF para aprovar → Saques a realizar → Saques realizados).
export default async function SaquesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  redirect(`/admin/pagamentos/cnpj?etapa=${ver === "aprovados" ? "pagar" : ver === "decididos" ? "pago" : "aprovar"}`);
}
