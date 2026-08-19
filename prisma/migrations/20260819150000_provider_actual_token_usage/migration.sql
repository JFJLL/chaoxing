-- Preserve historical estimate fields for audit compatibility, but record all new
-- operational Token statistics from provider-returned usage only.
ALTER TABLE "CopilotUsageEvent" ADD COLUMN "tokenUsageSource" TEXT NOT NULL DEFAULT 'UNAVAILABLE';
ALTER TABLE "CopilotUsageEvent" ADD COLUMN "tokenUsageProvider" TEXT;
ALTER TABLE "CopilotUsageEvent" ADD COLUMN "tokenUsageModel" TEXT;
ALTER TABLE "CopilotUsageEvent" ADD COLUMN "promptTokensActual" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CopilotUsageEvent" ADD COLUMN "completionTokensActual" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CopilotUsageEvent" ADD COLUMN "totalTokensActual" INTEGER NOT NULL DEFAULT 0;
