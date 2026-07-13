import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migrationPath = join(root, "prisma/migrations/20260713001000_ai_generation_integrity/migration.sql");
const leaseMigrationPath = join(root, "prisma/migrations/20260713002000_ai_generation_lease/migration.sql");
const publicationMigrationPath = join(root, "prisma/migrations/20260713003000_ai_artifact_publication_invariant/migration.sql");

describe("AI generation integrity migration", () => {
  it("keeps question creators nullable and scopes source keys by course", () => {
    expect(schema).toMatch(/createdById\s+String\?/);
    expect(schema).toMatch(/createdBy\s+User\?\s+@relation\(fields: \[createdById\], references: \[id\], onDelete: SetNull\)/);
    expect(schema).toContain("@@unique([courseId, sourceSeriesId, sourceKey])");
  });

  it("preserves all question columns while rebuilding the table", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain('INSERT INTO "new_CourseQuestion"');
    for (const column of [
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
    ]) {
      expect(sql).toContain(`"${column}"`);
    }
  });

  it("guards question and revision sources on both insert and update", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("CourseQuestion_source_integrity_insert");
    expect(sql).toContain("CourseQuestion_source_integrity_update");
    expect(sql).toContain("CourseAiArtifact_source_integrity_insert");
    expect(sql).toContain("CourseAiArtifact_source_integrity_update");
    expect(sql).toMatch(/artifact\."courseId"\s*=\s*NEW\."courseId"/);
    expect(sql).toMatch(/artifact\."seriesId"\s*=\s*NEW\."sourceSeriesId"/);
    expect(sql).toContain("COURSE_QUESTION_SOURCE_MISMATCH");
    expect(sql).toContain("COURSE_ARTIFACT_SOURCE_MISMATCH");
  });

  it("adds the generation lease only in a follow-up migration", () => {
    const sql = readFileSync(leaseMigrationPath, "utf8");

    expect(schema).toMatch(/runToken\s+String\?/);
    expect(sql).toContain('ALTER TABLE "CourseAiArtifact" ADD COLUMN "runToken" TEXT');
    expect(sql).toContain('CREATE INDEX "CourseAiArtifact_status_runToken_idx"');
  });

  it("fails rather than silently cleaning duplicate published revisions", () => {
    const sql = readFileSync(publicationMigrationPath, "utf8");
    expect(sql).toContain('CREATE UNIQUE INDEX "CourseAiArtifact_one_published_per_series"');
    expect(sql).toMatch(/ON "CourseAiArtifact"\("seriesId"\)\s+WHERE "status" = 'PUBLISHED'/);
    expect(sql).not.toMatch(/^\s*(?:DELETE|UPDATE\s+"CourseAiArtifact")/im);
  });
});
