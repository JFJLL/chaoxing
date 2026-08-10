CREATE TRIGGER "AnnouncementAttachment_active_file_insert"
BEFORE INSERT ON "AnnouncementAttachment"
WHEN NOT EXISTS (
  SELECT 1 FROM "DriveFile"
  WHERE "id" = NEW."driveFileId" AND "deletedAt" IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'notice attachment requires an active drive file');
END;

CREATE TRIGGER "DriveFile_notice_soft_delete_guard"
BEFORE UPDATE OF "deletedAt" ON "DriveFile"
WHEN NEW."deletedAt" IS NOT NULL
  AND OLD."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "AnnouncementAttachment"
    WHERE "driveFileId" = OLD."id"
  )
BEGIN
  SELECT RAISE(ABORT, 'drive file is referenced by a notice');
END;
