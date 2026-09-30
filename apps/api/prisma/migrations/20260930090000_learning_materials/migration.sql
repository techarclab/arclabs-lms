-- CreateTable
CREATE TABLE "material_folders" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "folderId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "fileType" TEXT,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "assignToAll" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_audiences" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,

    CONSTRAINT "material_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_activity" (
    "materialId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_activity_pkey" PRIMARY KEY ("materialId","userId")
);

-- CreateIndex
CREATE INDEX "material_folders_organizationId_parentId_idx" ON "material_folders"("organizationId", "parentId");

-- CreateIndex
CREATE INDEX "materials_organizationId_folderId_idx" ON "materials"("organizationId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "material_audiences_materialId_departmentId_key" ON "material_audiences"("materialId", "departmentId");

-- CreateIndex
CREATE INDEX "material_activity_userId_idx" ON "material_activity"("userId");

-- AddForeignKey
ALTER TABLE "material_folders" ADD CONSTRAINT "material_folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_folders" ADD CONSTRAINT "material_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "material_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "material_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_audiences" ADD CONSTRAINT "material_audiences_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_audiences" ADD CONSTRAINT "material_audiences_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_activity" ADD CONSTRAINT "material_activity_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_activity" ADD CONSTRAINT "material_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
