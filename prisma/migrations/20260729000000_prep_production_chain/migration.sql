-- Add course outline concurrency and import source metadata without rewriting existing rows.
ALTER TABLE "Course" ADD COLUMN "outlineVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DocumentImportJob" ADD COLUMN "batchId" TEXT;
ALTER TABLE "DocumentImportJob" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "DocumentImportJob" ADD COLUMN "parsedSections" TEXT;

CREATE TABLE "CourseCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MANAGER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseCollaborator_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DocumentImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "generatedOutline" TEXT,
    "savedOutlineVersion" INTEGER,
    "savedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentImportBatch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CourseCollaborator_courseId_userId_key" ON "CourseCollaborator"("courseId", "userId");
CREATE INDEX "CourseCollaborator_userId_updatedAt_idx" ON "CourseCollaborator"("userId", "updatedAt");
CREATE INDEX "DocumentImportBatch_courseId_createdAt_idx" ON "DocumentImportBatch"("courseId", "createdAt");
CREATE INDEX "DocumentImportBatch_userId_createdAt_idx" ON "DocumentImportBatch"("userId", "createdAt");
CREATE INDEX "DocumentImportJob_batchId_createdAt_idx" ON "DocumentImportJob"("batchId", "createdAt");
CREATE INDEX "DocumentImportJob_courseId_contentHash_idx" ON "DocumentImportJob"("courseId", "contentHash");
CREATE INDEX "CourseKnowledgeMap_sourceJobId_status_version_idx" ON "CourseKnowledgeMap"("sourceJobId", "status", "version");

-- SQLite cannot add a foreign key with ALTER TABLE. Integrity is enforced by
-- the trigger while preserving all existing import rows in place.
CREATE TRIGGER "DocumentImportJob_batch_integrity_insert"
BEFORE INSERT ON "DocumentImportJob"
WHEN NEW."batchId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "DocumentImportBatch" batch
  WHERE batch."id" = NEW."batchId" AND batch."courseId" = NEW."courseId" AND batch."userId" = NEW."userId"
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_IMPORT_BATCH_MISMATCH');
END;

CREATE TRIGGER "DocumentImportJob_batch_integrity_update"
BEFORE UPDATE OF "batchId", "courseId", "userId" ON "DocumentImportJob"
WHEN NEW."batchId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "DocumentImportBatch" batch
  WHERE batch."id" = NEW."batchId" AND batch."courseId" = NEW."courseId" AND batch."userId" = NEW."userId"
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_IMPORT_BATCH_MISMATCH');
END;
