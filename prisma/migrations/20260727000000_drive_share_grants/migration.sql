-- CreateTable
CREATE TABLE "DriveShareGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriveShareGrant_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "DriveShare" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DriveShareGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveShareGrant_shareId_userId_key" ON "DriveShareGrant"("shareId", "userId");

-- CreateIndex
CREATE INDEX "DriveShareGrant_userId_idx" ON "DriveShareGrant"("userId");
