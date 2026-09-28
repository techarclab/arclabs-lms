-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "joinCode" TEXT,
ADD COLUMN     "joinEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_joinCode_key" ON "organizations"("joinCode");
