-- D-CONTRACTSWITCH: chave por marca para exigir o contrato (Autentique) antes de liberar a creator aprovada.
ALTER TABLE "Brand" ADD COLUMN "contractLock" BOOLEAN NOT NULL DEFAULT true;
