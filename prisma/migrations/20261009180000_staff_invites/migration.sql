-- CreateTable
CREATE TABLE "StaffInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "brandId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvite_tokenHash_key" ON "StaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvite_email_idx" ON "StaffInvite"("email");

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas (E2.4)
ALTER TABLE "StaffInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffInvite"
  ADD CONSTRAINT "StaffInvite_global_only_super_admin" CHECK ("brandId" IS NOT NULL OR "role" = 'SUPER_ADMIN');
ALTER TABLE "StaffInvite"
  ADD CONSTRAINT "StaffInvite_accepted_has_user" CHECK (("acceptedAt" IS NULL) = ("acceptedUserId" IS NULL));
