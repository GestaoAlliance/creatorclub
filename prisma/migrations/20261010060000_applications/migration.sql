-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CreatorApplication" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "instagram" TEXT,
    "followers" TEXT,
    "niche" TEXT,
    "kindAnswer" TEXT,
    "address" TEXT,
    "suggestedCoupon" TEXT,
    "cpf" TEXT,
    "cnpj" TEXT,
    "companyName" TEXT,
    "pixKey" TEXT,
    "raw" JSONB NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "creatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatorApplication_brandId_status_submittedAt_idx" ON "CreatorApplication"("brandId", "status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorApplication_brandId_source_externalKey_key" ON "CreatorApplication"("brandId", "source", "externalKey");

-- AddForeignKey
ALTER TABLE "CreatorApplication" ADD CONSTRAINT "CreatorApplication_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS (D-RLS).
ALTER TABLE "CreatorApplication" ENABLE ROW LEVEL SECURITY;

-- Decisão coerente: nova sem decisão; decidida com data e autor; aprovada aponta a creator criada.
ALTER TABLE "CreatorApplication"
  ADD CONSTRAINT "CreatorApplication_decided" CHECK (
    ("status" = 'NEW') = ("decidedAt" IS NULL)
    AND ("decidedAt" IS NULL) = ("decidedById" IS NULL)
    AND ("status" = 'APPROVED') = ("creatorId" IS NOT NULL)),
  ADD CONSTRAINT "CreatorApplication_name" CHECK (btrim("fullName") <> '');
