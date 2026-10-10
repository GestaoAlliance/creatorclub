-- D-KIT: no modelo influencer out/26, quem passa de R$ 4.000 continua com 2 suplementos até chegar a R$ 10.000
-- (o contrato deixava um buraco entre R$ 4.000,01 e R$ 9.999,99; decisão de 2026-10-10).
UPDATE "ContractTemplate"
SET "kitTiers" = '[{"fromCents":100000,"products":1},{"fromCents":200000,"products":2},{"fromCents":1000000,"products":3}]'::jsonb
WHERE "key" = 'influencer-2026-10';
