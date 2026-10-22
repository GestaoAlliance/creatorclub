-- M2.1 (D-ACTIONS): tarefas da fila de ações marcadas como feitas.
-- CreateTable
CREATE TABLE "ActionDone" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneById" TEXT NOT NULL,

    CONSTRAINT "ActionDone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionDone_creatorId_idx" ON "ActionDone"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionDone_brandId_key_key" ON "ActionDone"("brandId", "key");

-- AddForeignKey
ALTER TABLE "ActionDone" ADD CONSTRAINT "ActionDone_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDone" ADD CONSTRAINT "ActionDone_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas
ALTER TABLE "ActionDone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionDone"
  ADD CONSTRAINT "ActionDone_key_format" CHECK ("key" ~ '^(IDLE|CONTRACT|NEAR_MIN|KIT_PENDING|SHIP_STUCK):.+$');
