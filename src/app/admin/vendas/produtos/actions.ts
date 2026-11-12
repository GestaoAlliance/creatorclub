"use server";

import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { productDetail } from "@/lib/reports/product-board";
import { staffContext } from "@/lib/staff/context";
import type { DashPeriod } from "@/lib/staff/dashboard";

/** D-PRODUCTBOARD: o painel do produto (só quem vê dinheiro na marca do topo). */
export async function productDetailAction(key: string, period: DashPeriod, scope: "creators" | "loja") {
  const actor = await currentActor();
  const brand = actor ? (await staffContext(actor)).brand : null;
  if (!actor || !brand || !can(actor.grants, "money.view", brand.id)) return null;
  return productDetail(db(), brand.id, key, period, scope);
}
