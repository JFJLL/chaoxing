ALTER TABLE "CourseKnowledgeMap" ADD COLUMN "selectionKey" TEXT;
ALTER TABLE "CourseKnowledgeMap" ADD COLUMN "sourceMapIds" TEXT;
ALTER TABLE "CourseKnowledgeMap" ADD COLUMN "textContent" TEXT;
ALTER TABLE "CourseKnowledgeMap" ADD COLUMN "deletedAt" DATETIME;

CREATE INDEX "CourseKnowledgeMap_courseId_selectionKey_status_version_idx"
ON "CourseKnowledgeMap"("courseId", "selectionKey", "status", "version");

CREATE INDEX "CourseKnowledgeMap_courseId_deletedAt_publishedAt_idx"
ON "CourseKnowledgeMap"("courseId", "deletedAt", "publishedAt");

CREATE TABLE "AnnouncementAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementAttachment_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnouncementAttachment_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "DriveFile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AnnouncementAttachment_announcementId_driveFileId_key"
ON "AnnouncementAttachment"("announcementId", "driveFileId");

CREATE INDEX "AnnouncementAttachment_driveFileId_idx"
ON "AnnouncementAttachment"("driveFileId");

UPDATE "Course" SET "copilotName" = '课程AI智能体' WHERE lower("copilotName") = 'copilot';

CREATE TRIGGER "Course_ai_agent_default"
AFTER INSERT ON "Course"
WHEN lower(NEW."copilotName") = 'copilot'
BEGIN
  UPDATE "Course" SET "copilotName" = '课程AI智能体' WHERE "id" = NEW."id";
END;
