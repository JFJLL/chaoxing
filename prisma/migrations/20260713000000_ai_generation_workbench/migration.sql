-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CourseAiArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT,
    "payload" TEXT,
    "inputSnapshot" TEXT,
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sourceJobId" TEXT,
    "sourceArtifactId" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "approvedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseAiArtifact_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiArtifact_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "DocumentImportJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CourseAiArtifact_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "CourseAiArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_CourseAiArtifact" (
    "id",
    "seriesId",
    "courseId",
    "userId",
    "appType",
    "title",
    "prompt",
    "payload",
    "status",
    "version",
    "sourceJobId",
    "publishedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "id",
    "courseId",
    "userId",
    "appType",
    "title",
    "prompt",
    "payload",
    "status",
    "version",
    "sourceJobId",
    "publishedAt",
    "createdAt",
    "updatedAt"
FROM "CourseAiArtifact";

DROP TABLE "CourseAiArtifact";
ALTER TABLE "new_CourseAiArtifact" RENAME TO "CourseAiArtifact";

CREATE TABLE "CourseQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
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
    CONSTRAINT "CourseQuestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseQuestion_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "CourseAiArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CourseAiArtifact_seriesId_version_key" ON "CourseAiArtifact"("seriesId", "version");
CREATE INDEX "CourseAiArtifact_courseId_appType_status_idx" ON "CourseAiArtifact"("courseId", "appType", "status");
CREATE INDEX "CourseAiArtifact_status_createdAt_idx" ON "CourseAiArtifact"("status", "createdAt");
CREATE INDEX "CourseAiArtifact_sourceArtifactId_idx" ON "CourseAiArtifact"("sourceArtifactId");
CREATE UNIQUE INDEX "CourseQuestion_sourceSeriesId_sourceKey_key" ON "CourseQuestion"("sourceSeriesId", "sourceKey");
CREATE INDEX "CourseQuestion_courseId_status_type_idx" ON "CourseQuestion"("courseId", "status", "type");
CREATE INDEX "CourseQuestion_sourceArtifactId_idx" ON "CourseQuestion"("sourceArtifactId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
