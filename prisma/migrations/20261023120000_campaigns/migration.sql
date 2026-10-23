-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'PRIZE';

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "briefing" TEXT NOT NULL,
    "startDay" TEXT NOT NULL,
    "endDay" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "categories" "CreatorCategory"[],
    "tagIds" TEXT[],
    "rankingPrizes" INTEGER[],
    "goalCents" INTEGER,
    "goalPrizeCents" INTEGER,
    "allianceOsUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "settledById" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEntry" (
    "campaignId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEntry_pkey" PRIMARY KEY ("campaignId","creatorId")
);

-- CreateTable
CREATE TABLE "CampaignPrize" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "position" INTEGER,
    "salesCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPrize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_brandId_startsAt_idx" ON "Campaign"("brandId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_id_brandId_key" ON "Campaign"("id", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPrize_ledgerEntryId_key" ON "CampaignPrize"("ledgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPrize_campaignId_creatorId_kind_key" ON "CampaignPrize"("campaignId", "creatorId", "kind");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEntry" ADD CONSTRAINT "CampaignEntry_campaignId_brandId_fkey" FOREIGN KEY ("campaignId", "brandId") REFERENCES "Campaign"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEntry" ADD CONSTRAINT "CampaignEntry_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEntry" ADD CONSTRAINT "CampaignEntry_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPrize" ADD CONSTRAINT "CampaignPrize_campaignId_brandId_fkey" FOREIGN KEY ("campaignId", "brandId") REFERENCES "Campaign"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPrize" ADD CONSTRAINT "CampaignPrize_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPrize" ADD CONSTRAINT "CampaignPrize_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPrize" ADD CONSTRAINT "CampaignPrize_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D-RLS
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignPrize" ENABLE ROW LEVEL SECURITY;

-- D-CAMPAIGN: prêmio de campanha é crédito, com motivo e quem confirmou. (Comparação como texto: o valor novo do
-- enum não pode ser usado na mesma transação em que foi criado.)
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_sign_by_type";
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_sign_by_type" CHECK (
  ("type" = 'COMMISSION' AND "amountCents" > 0)
  OR ("type" = 'REVERSAL' AND "amountCents" < 0)
  OR ("type" = 'WITHDRAWAL' AND "amountCents" < 0)
  OR ("type" IN ('ADJUSTMENT', 'OPENING_BALANCE'))
  OR ("type"::text = 'PRIZE' AND "amountCents" > 0 AND "note" IS NOT NULL AND btrim("note") <> '' AND "createdById" IS NOT NULL));

-- D-CAMPAIGN: campanha coerente (nome e briefing, período, prêmios positivos, meta com prêmio e vice-versa).
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_valid" CHECK (
  btrim("name") <> '' AND btrim("briefing") <> ''
  AND "startDay" ~ '^\d{4}-\d{2}-\d{2}$' AND "endDay" ~ '^\d{4}-\d{2}-\d{2}$' AND "startDay" <= "endDay"
  AND "startsAt" < "endsAt"
  AND cardinality("rankingPrizes") <= 10 AND 0 < ALL ("rankingPrizes")
  AND (("goalCents" IS NULL) = ("goalPrizeCents" IS NULL))
  AND ("goalCents" IS NULL OR ("goalCents" > 0 AND "goalPrizeCents" > 0))
  AND (cardinality("rankingPrizes") > 0 OR "goalCents" IS NOT NULL)
  AND ("settledAt" IS NULL OR ("publishedAt" IS NOT NULL AND "settledById" IS NOT NULL))
);
ALTER TABLE "CampaignPrize" ADD CONSTRAINT "CampaignPrize_valid" CHECK (
  "amountCents" > 0 AND "salesCents" >= 0
  AND (("kind" = 'RANK' AND "position" >= 1) OR ("kind" = 'GOAL' AND "position" IS NULL))
);
