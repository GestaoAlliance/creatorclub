-- D-WELCOMEVIDEO (Opção 2 das regras da Botanika, reunião de 2026-10-27; resposta do responsável em 2026-10-28): na
-- aprovação a Gestão escolhe o envio inicial: 1 produto, ou 2 produtos em troca de 3 vídeos para a marca.

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "welcomeVideos" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Creator" ADD CONSTRAINT "Creator_welcomeVideos" CHECK ("welcomeVideos" >= 0);
