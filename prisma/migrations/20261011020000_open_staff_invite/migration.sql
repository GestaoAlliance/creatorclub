-- D-OPENINVITE: convite da equipe sem e-mail (a pessoa escolhe o e-mail no primeiro acesso). Nunca para super admin.
ALTER TABLE "StaffInvite" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "StaffInvite"
  ADD CONSTRAINT "StaffInvite_open_not_super_admin" CHECK ("email" IS NOT NULL OR "role" <> 'SUPER_ADMIN');
