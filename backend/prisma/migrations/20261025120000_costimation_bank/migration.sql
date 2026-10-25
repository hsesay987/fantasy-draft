-- CreateTable
CREATE TABLE "CostProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" TEXT,
    "category" TEXT,
    "imageUrl" TEXT,
    "kind" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "samples" INTEGER NOT NULL DEFAULT 1,
    "priceDate" TIMESTAMP(3),
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostProduct_code_store_currency_key" ON "CostProduct"("code", "store", "currency");

-- CreateIndex
CREATE INDEX "CostProduct_country_store_idx" ON "CostProduct"("country", "store");

-- CreateIndex
CREATE INDEX "CostProduct_uses_idx" ON "CostProduct"("uses");
