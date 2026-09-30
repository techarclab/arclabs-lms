-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "joinCode" TEXT,
ADD COLUMN     "joinEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "departments_joinCode_key" ON "departments"("joinCode");
