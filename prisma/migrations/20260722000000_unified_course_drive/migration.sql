-- Remove the unused course-list grouping table. This does not touch DriveFile.
PRAGMA foreign_keys=off;
DROP TABLE "CourseFolder";
PRAGMA foreign_keys=on;

CREATE TABLE "CourseDriveBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseDriveBinding_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseDriveBinding_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DriveFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CourseDriveAccessRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseDriveAccessRule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseDriveAccessRule_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "DriveFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseDriveAccessRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CourseAiArtifactExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "driveFileId" TEXT,
    "contentHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "errorMessage" TEXT,
    "lastExportedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseAiArtifactExport_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "CourseAiArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiArtifactExport_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "DriveFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CopilotConversationFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "driveFileId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "referenceType" TEXT NOT NULL DEFAULT 'FILE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopilotConversationFile_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CourseAiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CopilotConversationFile_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "DriveFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CopilotConversationFile" ("conversationId", "createdAt", "driveFileId", "fileName", "id", "mimeType")
SELECT "conversationId", "createdAt", "driveFileId", "fileName", "id", "mimeType" FROM "CopilotConversationFile";
DROP TABLE "CopilotConversationFile";
ALTER TABLE "new_CopilotConversationFile" RENAME TO "CopilotConversationFile";
CREATE INDEX "CopilotConversationFile_driveFileId_createdAt_idx" ON "CopilotConversationFile"("driveFileId", "createdAt");
CREATE UNIQUE INDEX "CopilotConversationFile_conversationId_driveFileId_key" ON "CopilotConversationFile"("conversationId", "driveFileId");

CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover" TEXT,
    "term" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "driveRootFolderId" TEXT,
    "copilotName" TEXT NOT NULL DEFAULT 'Copilot',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Course_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Course_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Course_driveRootFolderId_fkey" FOREIGN KEY ("driveRootFolderId") REFERENCES "DriveFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Preserve every existing Copilot folder as the course drive root.
INSERT INTO "new_Course" ("copilotName", "cover", "createdAt", "description", "driveRootFolderId", "endDate", "id", "institutionId", "ownerId", "startDate", "status", "term", "title", "updatedAt")
SELECT
    old_course."copilotName",
    old_course."cover",
    old_course."createdAt",
    old_course."description",
    CASE
      WHEN old_course."copilotFolderId" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "DriveFile" AS root
          WHERE root."id" = old_course."copilotFolderId"
            AND root."ownerId" = old_course."ownerId"
            AND root."kind" = 'folder'
            AND root."deletedAt" IS NULL
        )
        AND old_course."id" = (
          SELECT MIN(other_course."id")
          FROM "Course" AS other_course
          INNER JOIN "DriveFile" AS valid_root
            ON valid_root."id" = other_course."copilotFolderId"
            AND valid_root."ownerId" = other_course."ownerId"
            AND valid_root."kind" = 'folder'
            AND valid_root."deletedAt" IS NULL
          WHERE other_course."copilotFolderId" = old_course."copilotFolderId"
        )
      THEN old_course."copilotFolderId"
      ELSE NULL
    END,
    old_course."endDate",
    old_course."id",
    old_course."institutionId",
    old_course."ownerId",
    old_course."startDate",
    old_course."status",
    old_course."term",
    old_course."title",
    old_course."updatedAt"
FROM "Course" AS old_course;
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE UNIQUE INDEX "Course_driveRootFolderId_key" ON "Course"("driveRootFolderId");

-- Add artifact workflow fields in place so the integrity triggers that reference
-- CourseAiArtifact remain valid throughout the migration.
ALTER TABLE "CourseAiArtifact" ADD COLUMN "publishedPayload" TEXT;
ALTER TABLE "CourseAiArtifact" ADD COLUMN "withdrawnAt" DATETIME;
ALTER TABLE "CourseAiArtifact" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "CourseAiArtifact" ADD COLUMN "lockVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "CourseAiArtifact"
SET "publishedPayload" = "payload"
WHERE "publishedAt" IS NOT NULL OR "status" = 'PUBLISHED';
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX "CourseDriveBinding_folderId_idx" ON "CourseDriveBinding"("folderId");
CREATE UNIQUE INDEX "CourseDriveBinding_courseId_purpose_key" ON "CourseDriveBinding"("courseId", "purpose");
CREATE INDEX "CourseDriveAccessRule_driveFileId_idx" ON "CourseDriveAccessRule"("driveFileId");
CREATE INDEX "CourseDriveAccessRule_updatedById_idx" ON "CourseDriveAccessRule"("updatedById");
CREATE UNIQUE INDEX "CourseDriveAccessRule_courseId_driveFileId_key" ON "CourseDriveAccessRule"("courseId", "driveFileId");
CREATE INDEX "CourseAiArtifactExport_driveFileId_idx" ON "CourseAiArtifactExport"("driveFileId");
CREATE INDEX "CourseAiArtifactExport_status_updatedAt_idx" ON "CourseAiArtifactExport"("status", "updatedAt");
CREATE UNIQUE INDEX "CourseAiArtifactExport_artifactId_format_variant_key" ON "CourseAiArtifactExport"("artifactId", "format", "variant");
