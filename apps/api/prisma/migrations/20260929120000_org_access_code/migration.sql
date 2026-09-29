-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "accessCodeCreatedAt" TIMESTAMP(3),
ADD COLUMN     "accessCodeHash" TEXT,
ADD COLUMN     "accessCodeHint" TEXT;

-- CreateTable
CREATE TABLE "org_access_sessions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "org_access_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_access_sessions_tokenHash_key" ON "org_access_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "org_access_sessions_organizationId_idx" ON "org_access_sessions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_accessCodeHash_key" ON "organizations"("accessCodeHash");

-- AddForeignKey
ALTER TABLE "org_access_sessions" ADD CONSTRAINT "org_access_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
