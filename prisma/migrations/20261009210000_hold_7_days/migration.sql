-- AlterTable
ALTER TABLE "Brand" ALTER COLUMN "commissionHoldDays" SET DEFAULT 7;


-- D-HOLD (2026-10-09): marcas criadas antes da decisão, ainda com 0, passam a 7 dias.
UPDATE "Brand" SET "commissionHoldDays" = 7 WHERE "commissionHoldDays" = 0;
