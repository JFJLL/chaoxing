-- CreateTable
CREATE TABLE "DriveFileDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driveFileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "downloadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriveFileDownload_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "DriveFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DriveFileDownload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveFileDownload_driveFileId_userId_key" ON "DriveFileDownload"("driveFileId", "userId");

-- CreateIndex
CREATE INDEX "DriveFileDownload_userId_downloadedAt_idx" ON "DriveFileDownload"("userId", "downloadedAt");
