-- AlterTable
ALTER TABLE "CommissionPolicy" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "classifiedAt" TIMESTAMP(3),
ADD COLUMN     "classifiedById" TEXT,
ALTER COLUMN "kind" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CouponAssignment" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT;


-- D-CLASS / D-RATEIMPORT: tipo, dona e taxa ficam "a confirmar" até a Ana confirmar.
-- Cupom com tipo tem quem classificou e quando; sem tipo, nenhum dos dois.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_classified_consistent"
  CHECK ((("kind" IS NULL) = ("classifiedAt" IS NULL)) AND (("classifiedAt" IS NULL) = ("classifiedById" IS NULL)));

-- Confirmação sempre com autor.
ALTER TABLE "CouponAssignment" ADD CONSTRAINT "CouponAssignment_confirmed_has_author"
  CHECK (("confirmedAt" IS NULL) = ("confirmedById" IS NULL));
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "CommissionPolicy_confirmed_has_author"
  CHECK (("confirmedAt" IS NULL) = ("confirmedById" IS NULL));
