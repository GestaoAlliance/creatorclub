-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_creatorId_createdAt_idx" ON "Notification"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_creatorId_dedupeKey_key" ON "Notification"("creatorId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS (D-RLS).
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

-- Travas (D-NOTICES): tipos conhecidos, texto preenchido, link só interno.
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_valid" CHECK (
    "kind" IN ('COMMISSION_RELEASED', 'KIT_AVAILABLE', 'SHIPPED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REJECTED', 'FIRST_SALE',
               'WITHDRAWAL_WINDOW', 'NEAR_MINIMUM', 'CONTRACT_ENDING')
    AND btrim("title") <> '' AND btrim("body") <> '' AND btrim("dedupeKey") <> ''
    AND ("href" IS NULL OR "href" ~ '^/portal/')
  );
