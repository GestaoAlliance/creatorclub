import "server-only";
import { cookies } from "next/headers";
import { dashPeriod, type DashPeriod } from "./dashboard";

/** D-PERIODPICK: cookie com a última escolha do seletor (vale em todas as abas até mudar). */
export const PERIOD_COOKIE = "cc_period";

/** Período da tela: ?p= no endereço, senão a escolha guardada, senão o mês atual. */
export async function staffPeriod(sp: { p?: string; periodo?: string; de?: string; ate?: string }, timeZone: string, now = new Date()): Promise<DashPeriod> {
  const saved = (await cookies()).get(PERIOD_COOKIE)?.value ?? null;
  return dashPeriod(sp, timeZone, now, { saved });
}
