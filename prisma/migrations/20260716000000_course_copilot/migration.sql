-- AI coach was removed from the product. Remove its private conversation data
-- before rebuilding the shared conversation tables.
-- IF NOT EXISTS also repairs an interrupted SQLite migration that dropped the
-- table before its dependent triggers were removed.
CREATE TABLE IF NOT EXISTS "AiCoachTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "aiRole" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "rubric" TEXT NOT NULL,
    "completionCriteria" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiCoachTask_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiCoachTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
DROP TRIGGER IF EXISTS "CourseAiConversation_coach_course_insert";
DROP TRIGGER IF EXISTS "CourseAiConversation_coach_course_update";
DELETE FROM "CourseAiConversation" WHERE "kind" = 'COACH';

-- DropIndex
DROP INDEX IF EXISTS "AiCoachTask_createdById_updatedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "AiCoachTask_courseId_status_updatedAt_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "AiCoachTask";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "CopilotSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CopilotSkill_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CopilotSkill_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CopilotConversationFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "driveFileId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopilotConversationFile_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CourseAiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CopilotConversationFile_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "DriveFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CopilotUsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopilotUsageEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CopilotUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CopilotUsageEvent_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "CopilotSkill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "folderId" TEXT,
    "copilotFolderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Course_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Course_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Course_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CourseFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Course_copilotFolderId_fkey" FOREIGN KEY ("copilotFolderId") REFERENCES "DriveFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Course" ("cover", "createdAt", "description", "endDate", "folderId", "id", "institutionId", "ownerId", "startDate", "status", "term", "title", "updatedAt") SELECT "cover", "createdAt", "description", "endDate", "folderId", "id", "institutionId", "ownerId", "startDate", "status", "term", "title", "updatedAt" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE TABLE "new_CourseAiConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "generationToken" TEXT,
    "title" TEXT,
    "activeSkillId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseAiConversation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiConversation_activeSkillId_fkey" FOREIGN KEY ("activeSkillId") REFERENCES "CopilotSkill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CourseAiConversation" ("courseId", "createdAt", "generationToken", "id", "kind", "status", "title", "updatedAt", "userId") SELECT "courseId", "createdAt", "generationToken", "id", "kind", "status", "title", "updatedAt", "userId" FROM "CourseAiConversation";
DROP TABLE "CourseAiConversation";
ALTER TABLE "new_CourseAiConversation" RENAME TO "CourseAiConversation";
CREATE INDEX "CourseAiConversation_courseId_userId_kind_updatedAt_idx" ON "CourseAiConversation"("courseId", "userId", "kind", "updatedAt");
CREATE INDEX "CourseAiConversation_activeSkillId_updatedAt_idx" ON "CourseAiConversation"("activeSkillId", "updatedAt");
CREATE INDEX "CourseAiConversation_status_generationToken_idx" ON "CourseAiConversation"("status", "generationToken");
CREATE TABLE "new_CourseAiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" TEXT,
    "skillId" TEXT,
    "skillName" TEXT,
    "contextFiles" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseAiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CourseAiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiMessage_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "CopilotSkill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CourseAiMessage" ("citations", "content", "conversationId", "createdAt", "id", "role") SELECT "citations", "content", "conversationId", "createdAt", "id", "role" FROM "CourseAiMessage";
DROP TABLE "CourseAiMessage";
ALTER TABLE "new_CourseAiMessage" RENAME TO "CourseAiMessage";
CREATE INDEX "CourseAiMessage_conversationId_createdAt_idx" ON "CourseAiMessage"("conversationId", "createdAt");
CREATE INDEX "CourseAiMessage_skillId_createdAt_idx" ON "CourseAiMessage"("skillId", "createdAt");
CREATE TABLE "new_DocumentImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "originalName" TEXT NOT NULL,
    "filePath" TEXT,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT,
    "driveFileId" TEXT,
    "extractedText" TEXT,
    "generatedOutline" TEXT,
    "warning" TEXT,
    "errorMessage" TEXT,
    "currentStage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentImportJob_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentImportJob_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "DriveFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DocumentImportJob" ("courseId", "createdAt", "currentStage", "errorMessage", "extractedText", "filePath", "fileSize", "finishedAt", "generatedOutline", "id", "mimeType", "originalName", "retryCount", "startedAt", "status", "updatedAt", "userId", "warning") SELECT "courseId", "createdAt", "currentStage", "errorMessage", "extractedText", "filePath", "fileSize", "finishedAt", "generatedOutline", "id", "mimeType", "originalName", "retryCount", "startedAt", "status", "updatedAt", "userId", "warning" FROM "DocumentImportJob";
DROP TABLE "DocumentImportJob";
ALTER TABLE "new_DocumentImportJob" RENAME TO "DocumentImportJob";
CREATE TABLE "new_DriveFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT,
    "contentHash" TEXT,
    "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "extractionError" TEXT,
    "extractedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DriveFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DriveFile_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DriveFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DriveFile" ("createdAt", "deletedAt", "id", "kind", "mimeType", "name", "ownerId", "parentId", "path", "size", "updatedAt") SELECT "createdAt", "deletedAt", "id", "kind", "mimeType", "name", "ownerId", "parentId", "path", "size", "updatedAt" FROM "DriveFile";
DROP TABLE "DriveFile";
ALTER TABLE "new_DriveFile" RENAME TO "DriveFile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CopilotSkill_courseId_status_updatedAt_idx" ON "CopilotSkill"("courseId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CopilotSkill_uploadedById_updatedAt_idx" ON "CopilotSkill"("uploadedById", "updatedAt");

-- CreateIndex
CREATE INDEX "CopilotConversationFile_driveFileId_createdAt_idx" ON "CopilotConversationFile"("driveFileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CopilotConversationFile_conversationId_driveFileId_key" ON "CopilotConversationFile"("conversationId", "driveFileId");

-- CreateIndex
CREATE INDEX "CopilotUsageEvent_courseId_createdAt_idx" ON "CopilotUsageEvent"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotUsageEvent_userId_courseId_createdAt_idx" ON "CopilotUsageEvent"("userId", "courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotUsageEvent_skillId_createdAt_idx" ON "CopilotUsageEvent"("skillId", "createdAt");
