-- D-PHOTO: foto de perfil da creator (subida no portal/equipe ou a do Instagram).
ALTER TABLE "CreatorAccount" ADD COLUMN "photoPath" TEXT,
  ADD COLUMN "photoUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "igPhotoUrl" TEXT,
  ADD COLUMN "photoHidden" BOOLEAN NOT NULL DEFAULT false;

-- Caminho no bucket: <conta>/<id>.jpg; foto do Instagram só por https.
ALTER TABLE "CreatorAccount"
  ADD CONSTRAINT "CreatorAccount_photo_path" CHECK ("photoPath" IS NULL OR "photoPath" ~ '^[0-9a-zA-Z-]+/[0-9a-f-]{36}\.jpg$'),
  ADD CONSTRAINT "CreatorAccount_ig_photo_url" CHECK ("igPhotoUrl" IS NULL OR ("igPhotoUrl" ~ '^https://' AND char_length("igPhotoUrl") <= 2000));
