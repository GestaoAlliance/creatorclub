-- D-HUNTERLINK: link de cada hunter para os formulários; a candidata chega marcada com quem a trouxe.

-- AlterTable
ALTER TABLE "CreatorApplication" ADD COLUMN     "hunterCode" TEXT,
ADD COLUMN     "hunterLinkId" TEXT;

-- CreateTable
CREATE TABLE "HunterLink" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HunterLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HunterClick" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "hunterLinkId" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HunterClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormLink" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "urlTemplate" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HunterLink_brandId_code_key" ON "HunterLink"("brandId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "HunterLink_brandId_userId_key" ON "HunterLink"("brandId", "userId");

-- CreateIndex
CREATE INDEX "HunterClick_hunterLinkId_createdAt_idx" ON "HunterClick"("hunterLinkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FormLink_brandId_form_key" ON "FormLink"("brandId", "form");

-- AddForeignKey
ALTER TABLE "CreatorApplication" ADD CONSTRAINT "CreatorApplication_hunterLinkId_fkey" FOREIGN KEY ("hunterLinkId") REFERENCES "HunterLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HunterLink" ADD CONSTRAINT "HunterLink_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HunterLink" ADD CONSTRAINT "HunterLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HunterClick" ADD CONSTRAINT "HunterClick_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HunterClick" ADD CONSTRAINT "HunterClick_hunterLinkId_fkey" FOREIGN KEY ("hunterLinkId") REFERENCES "HunterLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Travas
ALTER TABLE "HunterLink"
  ADD CONSTRAINT "HunterLink_code_format" CHECK ("code" ~ '^[a-z0-9]{2,20}$');
ALTER TABLE "HunterClick"
  ADD CONSTRAINT "HunterClick_form" CHECK ("form" IN ('hunter', 'captacao'));
ALTER TABLE "FormLink"
  ADD CONSTRAINT "FormLink_values" CHECK (
    "form" IN ('hunter', 'captacao') AND "urlTemplate" LIKE 'https://docs.google.com/forms/%' AND position('CODIGO' in "urlTemplate") > 0
  );

-- Clique é registro: só recebe inserções.
CREATE TRIGGER "HunterClick_append_only"
  BEFORE UPDATE OR DELETE ON "HunterClick"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- D-RLS
ALTER TABLE "HunterLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HunterClick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormLink" ENABLE ROW LEVEL SECURITY;
