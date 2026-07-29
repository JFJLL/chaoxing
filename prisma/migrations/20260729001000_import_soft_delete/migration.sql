ALTER TABLE "DocumentImportJob" ADD COLUMN "deletedAt" DATETIME;
CREATE INDEX "DocumentImportJob_courseId_deletedAt_createdAt_idx" ON "DocumentImportJob"("courseId", "deletedAt", "createdAt");
