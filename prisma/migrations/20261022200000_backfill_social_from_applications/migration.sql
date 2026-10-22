-- D-SOCIALFILL: a aprovação não copiava o Instagram e o TikTok respondidos no formulário para o cadastro da creator.
-- Preenche só o que está vazio na conta, a partir da candidatura aprovada mais recente ligada a ela.
-- Mesma limpeza de `usableHandle` (src/domain/social.ts): sem endereço do site, sem @, de 2 a 30 caracteres válidos.
WITH apps AS (
  SELECT DISTINCT ON (c."accountId")
    c."accountId",
    regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(ap.instagram, '')), '^.*(instagram\.com|tiktok\.com)/@?', '', 'i'), '[/?#].*$', ''), '^@+', '') AS instagram,
    regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(ap.tiktok, '')), '^.*(instagram\.com|tiktok\.com)/@?', '', 'i'), '[/?#].*$', ''), '^@+', '') AS tiktok
  FROM "CreatorApplication" ap
  JOIN "Creator" c ON c.id = ap."creatorId"
  WHERE ap.status = 'APPROVED'
  ORDER BY c."accountId", ap."decidedAt" DESC NULLS LAST
)
UPDATE "CreatorAccount" a
SET
  instagram = CASE WHEN a.instagram IS NULL AND btrim(apps.instagram) ~ '^[A-Za-z0-9._]{2,30}$' THEN btrim(apps.instagram) ELSE a.instagram END,
  tiktok = CASE WHEN a.tiktok IS NULL AND btrim(apps.tiktok) ~ '^[A-Za-z0-9._]{2,30}$' THEN btrim(apps.tiktok) ELSE a.tiktok END
FROM apps
WHERE apps."accountId" = a.id
  AND ((a.instagram IS NULL AND btrim(apps.instagram) ~ '^[A-Za-z0-9._]{2,30}$')
    OR (a.tiktok IS NULL AND btrim(apps.tiktok) ~ '^[A-Za-z0-9._]{2,30}$'));
