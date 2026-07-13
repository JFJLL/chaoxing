-- Redefine CourseQuestion without deleting questions when their creator is removed.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CourseQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "createdById" TEXT,
    "sourceArtifactId" TEXT,
    "sourceSeriesId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "options" TEXT,
    "answer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseQuestion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseQuestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CourseQuestion_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "CourseAiArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_CourseQuestion" (
    "id",
    "courseId",
    "createdById",
    "sourceArtifactId",
    "sourceSeriesId",
    "sourceKey",
    "type",
    "stem",
    "options",
    "answer",
    "explanation",
    "status",
    "version",
    "approvedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "courseId",
    "createdById",
    "sourceArtifactId",
    "sourceSeriesId",
    "sourceKey",
    "type",
    "stem",
    "options",
    "answer",
    "explanation",
    "status",
    "version",
    "approvedAt",
    "createdAt",
    "updatedAt"
FROM "CourseQuestion";

DROP TABLE "CourseQuestion";
ALTER TABLE "new_CourseQuestion" RENAME TO "CourseQuestion";

CREATE UNIQUE INDEX "CourseQuestion_courseId_sourceSeriesId_sourceKey_key"
ON "CourseQuestion"("courseId", "sourceSeriesId", "sourceKey");
CREATE INDEX "CourseQuestion_courseId_status_type_idx"
ON "CourseQuestion"("courseId", "status", "type");
CREATE INDEX "CourseQuestion_sourceArtifactId_idx"
ON "CourseQuestion"("sourceArtifactId");

-- SQLite cannot express these course/series invariants as composite foreign keys
-- without changing the artifact primary key, so enforce them on every write.
CREATE TRIGGER "CourseQuestion_source_integrity_insert"
BEFORE INSERT ON "CourseQuestion"
WHEN NEW."sourceArtifactId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CourseAiArtifact" AS artifact
    WHERE artifact."id" = NEW."sourceArtifactId"
      AND artifact."courseId" = NEW."courseId"
      AND artifact."seriesId" = NEW."sourceSeriesId"
  )
BEGIN
  SELECT RAISE(ABORT, 'COURSE_QUESTION_SOURCE_MISMATCH');
END;

CREATE TRIGGER "CourseQuestion_source_integrity_update"
BEFORE UPDATE OF "sourceArtifactId", "courseId", "sourceSeriesId" ON "CourseQuestion"
WHEN NEW."sourceArtifactId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CourseAiArtifact" AS artifact
    WHERE artifact."id" = NEW."sourceArtifactId"
      AND artifact."courseId" = NEW."courseId"
      AND artifact."seriesId" = NEW."sourceSeriesId"
  )
BEGIN
  SELECT RAISE(ABORT, 'COURSE_QUESTION_SOURCE_MISMATCH');
END;

CREATE TRIGGER "CourseAiArtifact_source_integrity_insert"
BEFORE INSERT ON "CourseAiArtifact"
WHEN NEW."sourceArtifactId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CourseAiArtifact" AS source
    WHERE source."id" = NEW."sourceArtifactId"
      AND source."courseId" = NEW."courseId"
  )
BEGIN
  SELECT RAISE(ABORT, 'COURSE_ARTIFACT_SOURCE_MISMATCH');
END;

CREATE TRIGGER "CourseAiArtifact_source_integrity_update"
BEFORE UPDATE OF "sourceArtifactId", "courseId" ON "CourseAiArtifact"
WHEN NEW."sourceArtifactId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CourseAiArtifact" AS source
    WHERE source."id" = NEW."sourceArtifactId"
      AND source."courseId" = NEW."courseId"
  )
BEGIN
  SELECT RAISE(ABORT, 'COURSE_ARTIFACT_SOURCE_MISMATCH');
END;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
