import { redirect } from "next/navigation";

// Pagamentos foi dividido em CNPJ e CPF: o endereço antigo (e a troca de marca) abre o de CNPJ.
export default function PagamentosPage() {
  redirect("/admin/pagamentos/cnpj");
}
