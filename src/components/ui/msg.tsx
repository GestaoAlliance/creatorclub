import { ui } from "./styles";

/** Resposta de uma ação de formulário: erro (vermelho) ou confirmação (verde). */
export function Msg({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error) return <p role="alert" className={ui.error}>{state.error}</p>;
  if (state?.ok) return <p role="status" className={ui.ok}>{state.ok}</p>;
  return null;
}
