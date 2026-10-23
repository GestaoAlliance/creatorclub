import { badge } from "@/components/ui/styles";
import type { CampaignPhase } from "@/domain";

/** Cor do selo de cada fase da campanha (M4.5). */
export const PHASE_TONE: Record<CampaignPhase, string> = {
  DRAFT: badge.neutral,
  SOON: badge.sky,
  RUNNING: badge.green,
  WAITING: badge.amber,
  SETTLE: badge.amber,
  SETTLED: badge.neutral,
};
