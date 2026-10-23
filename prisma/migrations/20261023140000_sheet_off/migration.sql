-- AlterTable
ALTER TABLE "SheetSync" ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "disabledById" TEXT;


-- D-SHEETOFF: desligada sempre com quem desligou.
ALTER TABLE "SheetSync" ADD CONSTRAINT "SheetSync_disabled" CHECK (("disabledAt" IS NULL) = ("disabledById" IS NULL));
