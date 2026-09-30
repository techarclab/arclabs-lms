-- CreateTable
CREATE TABLE "lab_assessments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "heldOn" TIMESTAMP(3),
    "criteria" JSONB NOT NULL,
    "assignToAll" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_assessment_audiences" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,

    CONSTRAINT "lab_assessment_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_marks" (
    "assessmentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scores" JSONB NOT NULL DEFAULT '{}',
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "total" DOUBLE PRECISION,
    "gradedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_marks_pkey" PRIMARY KEY ("assessmentId","userId")
);

-- CreateIndex
CREATE INDEX "lab_assessments_organizationId_createdAt_idx" ON "lab_assessments"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lab_assessment_audiences_assessmentId_departmentId_key" ON "lab_assessment_audiences"("assessmentId", "departmentId");

-- CreateIndex
CREATE INDEX "lab_marks_userId_idx" ON "lab_marks"("userId");

-- AddForeignKey
ALTER TABLE "lab_assessments" ADD CONSTRAINT "lab_assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_assessments" ADD CONSTRAINT "lab_assessments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_assessment_audiences" ADD CONSTRAINT "lab_assessment_audiences_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "lab_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_assessment_audiences" ADD CONSTRAINT "lab_assessment_audiences_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_marks" ADD CONSTRAINT "lab_marks_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "lab_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_marks" ADD CONSTRAINT "lab_marks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_marks" ADD CONSTRAINT "lab_marks_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
