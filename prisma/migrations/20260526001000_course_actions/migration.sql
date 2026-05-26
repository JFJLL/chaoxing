-- CreateTable
CREATE TABLE "CourseFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseFolder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Course" ADD COLUMN "folderId" TEXT;

-- AddForeignKey
-- SQLite cannot add a named foreign key constraint with ALTER TABLE. Prisma will
-- enforce the relation through generated client metadata for this development DB.
