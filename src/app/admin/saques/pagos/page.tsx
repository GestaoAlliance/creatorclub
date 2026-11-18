import { redirect } from "next/navigation";

// D-PAYFLOW: "Pagos" virou a aba Saques realizados de Pagamentos CNPJ/CPF.
export default function PaidPage() {
  redirect("/admin/pagamentos/cnpj?etapa=pago");
}
