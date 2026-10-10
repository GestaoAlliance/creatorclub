-- D-SIGNUP: formulário de inscrição do próprio sistema (aceite de privacidade e limite de envios) e o link do
-- hunter para ele (form "inscricao").

-- AlterTable
ALTER TABLE "CreatorApplication" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "ipHash" TEXT;

-- Travas
ALTER TABLE "HunterClick" DROP CONSTRAINT "HunterClick_form";
ALTER TABLE "HunterClick"
  ADD CONSTRAINT "HunterClick_form" CHECK ("form" IN ('hunter', 'captacao', 'inscricao'));
ALTER TABLE "CreatorApplication"
  ADD CONSTRAINT "CreatorApplication_site_consent" CHECK ("source" <> 'site_form' OR "consentAt" IS NOT NULL);

-- Limite de envios: contar inscrições recentes do mesmo IP (hash do dia) na marca.
CREATE INDEX "CreatorApplication_site_ip" ON "CreatorApplication"("brandId", "ipHash", "createdAt") WHERE "ipHash" IS NOT NULL;
