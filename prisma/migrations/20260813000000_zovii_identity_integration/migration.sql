-- Expand-only migration: Zovii identity & integration foundation.
-- Does not modify any existing table other than adding User.phone.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ZOVII',
    "externalUserId" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'LINKED',
    "encryptedCredential" TEXT,
    "credentialUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstitutionIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ZOVII',
    "enterpriseId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuredById" TEXT,
    "configuredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstitutionIntegration_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstitutionIntegration_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstitutionIntegrationAdmin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstitutionIntegrationAdmin_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstitutionIntegrationAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstitutionIntegrationAdmin_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT,
    "institutionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "externalRequestId" TEXT,
    "result" TEXT,
    "errorCode" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExternalOperation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_provider_idx" ON "ExternalIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_externalUserId_key" ON "ExternalIdentity"("provider", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_phone_key" ON "ExternalIdentity"("provider", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionIntegration_institutionId_provider_key" ON "InstitutionIntegration"("institutionId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionIntegration_provider_enterpriseId_key" ON "InstitutionIntegration"("provider", "enterpriseId");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionIntegrationAdmin_institutionId_userId_key" ON "InstitutionIntegrationAdmin"("institutionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOperation_idempotencyKey_key" ON "ExternalOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ExternalOperation_userId_kind_idx" ON "ExternalOperation"("userId", "kind");

-- CreateIndex
CREATE INDEX "ExternalOperation_institutionId_kind_idx" ON "ExternalOperation"("institutionId", "kind");

-- CreateIndex
CREATE INDEX "ExternalOperation_status_updatedAt_idx" ON "ExternalOperation"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
