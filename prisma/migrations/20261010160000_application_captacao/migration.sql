-- D-CAPTACAO: formulário de Captação Botanika + VermeFree entra como candidatas (views dos stories, marcas, collab, observação).

-- AlterTable
ALTER TABLE "CreatorApplication" ADD COLUMN     "brandsWanted" TEXT,
ADD COLUMN     "collabInterest" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "storiesViews" TEXT;

