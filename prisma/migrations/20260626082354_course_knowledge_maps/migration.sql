-- CreateTable
CREATE TABLE "CourseKnowledgeMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "sourceJobId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseKnowledgeMap_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseKnowledgeMap_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "DocumentImportJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeNode_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "CourseKnowledgeMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "weight" REAL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeEdge_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "CourseKnowledgeMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "KnowledgeNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CourseAiArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceJobId" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseAiArtifact_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiArtifact_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "DocumentImportJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CourseAiArtifact" ("appType", "courseId", "createdAt", "id", "payload", "prompt", "title", "updatedAt", "userId") SELECT "appType", "courseId", "createdAt", "id", "payload", "prompt", "title", "updatedAt", "userId" FROM "CourseAiArtifact";
DROP TABLE "CourseAiArtifact";
ALTER TABLE "new_CourseAiArtifact" RENAME TO "CourseAiArtifact";
CREATE TABLE "new_DocumentImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "originalName" TEXT NOT NULL,
    "filePath" TEXT,
    "mimeType" TEXT,
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
    CONSTRAINT "DocumentImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DocumentImportJob" ("courseId", "createdAt", "errorMessage", "extractedText", "filePath", "generatedOutline", "id", "mimeType", "originalName", "status", "updatedAt", "userId", "warning") SELECT "courseId", "createdAt", "errorMessage", "extractedText", "filePath", "generatedOutline", "id", "mimeType", "originalName", "status", "updatedAt", "userId", "warning" FROM "DocumentImportJob";
DROP TABLE "DocumentImportJob";
ALTER TABLE "new_DocumentImportJob" RENAME TO "DocumentImportJob";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
