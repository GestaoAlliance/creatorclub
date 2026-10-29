-- D-CONTRACTREMIND: lembretes do contrato sem assinar (WhatsApp da marca no dia 3 e no dia 7).
ALTER TABLE "ContractRequest" ADD COLUMN "reminder3At" TIMESTAMP(3),
ADD COLUMN "reminder7At" TIMESTAMP(3);
