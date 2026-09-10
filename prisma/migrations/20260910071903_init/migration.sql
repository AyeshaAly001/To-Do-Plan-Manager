-- CreateTable
CREATE TABLE "system_health" (
    "id" UUID NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "system_health_pkey" PRIMARY KEY ("id")
);
