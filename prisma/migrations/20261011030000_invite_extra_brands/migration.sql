-- D-INVITEBRANDS: o convite da equipe pode dar o mesmo papel em mais de uma marca.
ALTER TABLE "StaffInvite" ADD COLUMN "extraBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "StaffInvite" SET "extraBrandIds" = ARRAY[]::TEXT[] WHERE "extraBrandIds" IS NULL;
ALTER TABLE "StaffInvite" ALTER COLUMN "extraBrandIds" SET NOT NULL;
