-- CreateTable
CREATE TABLE "NoticeRun" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoticeRun_brandId_day_key" ON "NoticeRun"("brandId", "day");

-- AddForeignKey
ALTER TABLE "NoticeRun" ADD CONSTRAINT "NoticeRun_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS (D-RLS).
ALTER TABLE "NoticeRun" ENABLE ROW LEVEL SECURITY;

-- Trava: dia no formato AAAA-MM-DD.
ALTER TABLE "NoticeRun" ADD CONSTRAINT "NoticeRun_day_format" CHECK ("day" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "created" >= 0);
