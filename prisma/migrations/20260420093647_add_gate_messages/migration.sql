-- CreateEnum
CREATE TYPE "GateMsgRole" AS ENUM ('USER', 'AGENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "GateMessage" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "role" "GateMsgRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateMessage_gateId_createdAt_idx" ON "GateMessage"("gateId", "createdAt");

-- AddForeignKey
ALTER TABLE "GateMessage" ADD CONSTRAINT "GateMessage_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
