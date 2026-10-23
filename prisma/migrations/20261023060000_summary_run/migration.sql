-- M3.4 (D-WEEKLY): resumo semanal da gestão pelo WhatsApp (um por marca, semana e pessoa).
-- CreateTable
CREATE TABLE "SummaryRun" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SummaryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SummaryRun_key_key" ON "SummaryRun"("key");


-- Travas
ALTER TABLE "SummaryRun" ENABLE ROW LEVEL SECURITY;
