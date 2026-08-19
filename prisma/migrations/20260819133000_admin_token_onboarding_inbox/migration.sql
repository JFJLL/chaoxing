ALTER TABLE "User" ADD COLUMN "onboardingState" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" DATETIME;

ALTER TABLE "CopilotUsageEvent" ADD COLUMN "promptTokensEstimate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CopilotUsageEvent" ADD COLUMN "completionTokensEstimate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CopilotUsageEvent" ADD COLUMN "totalTokensEstimate" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "MessageAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT,
  "byteSize" INTEGER NOT NULL DEFAULT 0,
  "storagePath" TEXT,
  "driveFileId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MessageAttachment_messageId_createdAt_idx" ON "MessageAttachment"("messageId", "createdAt");
CREATE INDEX "MessageAttachment_driveFileId_idx" ON "MessageAttachment"("driveFileId");
