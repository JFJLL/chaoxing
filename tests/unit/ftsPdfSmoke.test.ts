import { existsSync, mkdirSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractPdf } from "@/lib/document/extractPdf";
import {
  closeKnowledgeDb,
  indexKnowledgeDocument,
  searchKnowledgeChunks,
  toFtsMatchQuery
} from "@/lib/document/knowledgeDb";

const dbPath = resolve(".verification", "tmp", "smoke-knowledge.db");
const samplePdf = "artifacts/verification/ppt-sample/course-production-chain-sample.pdf";
const skipWithoutFixture = !existsSync(samplePdf);

beforeAll(() => {
  process.env.KNOWLEDGE_DB_PATH = dbPath;
  mkdirSync(dirname(dbPath), { recursive: true });
  for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${dbPath}${suffix}`, { force: true });
});

afterAll(() => {
  closeKnowledgeDb();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${dbPath}${suffix}`, { force: true });
  delete process.env.KNOWLEDGE_DB_PATH;
});

describe("end-to-end FTS smoke", () => {
  it.skipIf(skipWithoutFixture)("extracts a real multi-page PDF with pages, indexes it, and searches in CJK and English", async () => {
    const extracted = await extractPdf(samplePdf);
    expect(extracted.pages).toBe(6);
    expect(extracted.pageChunks?.length).toBeGreaterThan(0);
    expect(extracted.pageChunks?.every((chunk) => chunk.page >= 1 && chunk.page <= 6)).toBe(true);

    indexKnowledgeDocument("smoke-file", extracted);
    const cjk = searchKnowledgeChunks({
      fileIds: ["smoke-file"],
      match: toFtsMatchQuery(["课程目录"]),
      substrings: ["课程目录"]
    });
    expect(cjk.length).toBeGreaterThan(0);
    const english = searchKnowledgeChunks({
      fileIds: ["smoke-file"],
      match: toFtsMatchQuery(["contents"])
    });
    expect(english.length).toBeGreaterThan(0);
    expect(cjk[0]?.page).toBeGreaterThanOrEqual(1);
  });

  it("finds a Chinese concept buried deep inside a long document via substring fallback", () => {
    const body = "Introduction to plant biology. ".repeat(300)
      + "植物的光合作用发生在叶绿体中，是生物学的核心概念。"
      + " More content. ".repeat(200);
    indexKnowledgeDocument("smoke-zh", { text: body });
    const zh = searchKnowledgeChunks({
      fileIds: ["smoke-zh"],
      match: toFtsMatchQuery(["光合"]),
      substrings: ["光合"]
    });
    expect(zh.length).toBeGreaterThan(0);
    expect(zh[0]?.content).toContain("光合作用");
  });
});
