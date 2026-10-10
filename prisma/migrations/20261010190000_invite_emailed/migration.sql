-- D-EMAIL: quando o convite foi enviado por e-mail.

-- AlterTable
ALTER TABLE "CreatorInvite" ADD COLUMN     "emailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StaffInvite" ADD COLUMN     "emailedAt" TIMESTAMP(3);

