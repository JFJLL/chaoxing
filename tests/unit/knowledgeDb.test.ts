import { randomUUID } from "crypto";
import { mkdirSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildKnowledgeChunks,
  closeKnowledgeDb,
  indexKnowledgeDocument,
  removeKnowledgeDocument,
  searchKnowledgeChunks,
  toFtsMatchQuery
} from "@/lib/document/knowledgeDb";

const testDatabasePath = resolve(".verification", "tmp", `knowledge-${randomUUID()}.db`);

beforeAll(() => {
  mkdirSync(dirname(testDatabasePath), { recursive: true });
  process.env.KNOWLEDGE_DB_PATH = testDatabasePath;
});

beforeEach(() => {
  closeKnowledgeDb();
});

afterAll(() => {
  closeKnowledgeDb();
  delete process.env.KNOWLEDGE_DB_PATH;
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    rmSync(`${testDatabasePath}${suffix}`, { force: true });
  }
});

describe("knowledgeDb FTS5 index", () => {
  it("indexes the full document (not just the head) and finds tail content", () => {
    const body = "introduction ".repeat(200) + "photosynthesis deep inside the textbook chapter";
    indexKnowledgeDocument("file-tail", { text: body });
    const hits = searchKnowledgeChunks({ fileIds: ["file-tail"], match: toFtsMatchQuery(["photosynthesis"]) });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.content.includes("deep inside the textbook"))).toBe(true);
  });

  it("stems English word families (porter): 'produce' matches 'produces'/'products'", () => {
    indexKnowledgeDocument("file-stem", { text: "production management produces measurable products" });
    const hits = searchKnowledgeChunks({ fileIds: ["file-stem"], match: toFtsMatchQuery(["produce"]) });
    expect(hits.some((hit) => hit.content.includes("produces") && hit.content.includes("products"))).toBe(true);
    expect(searchKnowledgeChunks({ fileIds: ["file-stem"], match: toFtsMatchQuery(["production"]) }).length).toBeGreaterThan(0);
  });

  it("keeps page numbers on PDF chunks and scopes hits to the requested fileIds", () => {
    indexKnowledgeDocument("file-a", {
      text: "page one content\n\npage two content",
      pageChunks: [
        { page: 1, text: "page one content" },
        { page: 2, text: "page two content" }
      ]
    });
    indexKnowledgeDocument("file-b", { text: "page two content of another file" });

    const hits = searchKnowledgeChunks({ fileIds: ["file-a"], match: toFtsMatchQuery(["page two content"]) });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ fileId: "file-a", page: 2 });
  });

  it("matches Chinese terms via the CJK substring fallback", () => {
    indexKnowledgeDocument("file-zh", { text: "光合作用与呼吸作用的关系" });
    const hits = searchKnowledgeChunks({
      fileIds: ["file-zh"],
      match: toFtsMatchQuery(["光合"]),
      substrings: ["光合"]
    });
    expect(hits.some((hit) => hit.content.includes("光合作用"))).toBe(true);
  });

  it("replaces chunks idempotently on re-index and removes them on delete", () => {
    indexKnowledgeDocument("file-idem", { text: "first version" });
    indexKnowledgeDocument("file-idem", { text: "second version of the textbook" });
    const hits = searchKnowledgeChunks({ fileIds: ["file-idem"], match: toFtsMatchQuery(["second version"]) });
    expect(hits.length).toBeGreaterThan(0);
    expect(searchKnowledgeChunks({ fileIds: ["file-idem"], match: toFtsMatchQuery(["first version"]) })).toHaveLength(0);

    expect(removeKnowledgeDocument("file-idem")).toBeGreaterThan(0);
    expect(searchKnowledgeChunks({ fileIds: ["file-idem"], match: toFtsMatchQuery(["second version"]) })).toHaveLength(0);
  });

  it("clears stale chunks when a file is rebuilt with no extractable text", () => {
    indexKnowledgeDocument("file-stale", { text: "old extractable content" });
    expect(searchKnowledgeChunks({ fileIds: ["file-stale"], match: toFtsMatchQuery(["extractable"]) })).toHaveLength(1);

    indexKnowledgeDocument("file-stale", { text: "" });
    expect(searchKnowledgeChunks({ fileIds: ["file-stale"], match: toFtsMatchQuery(["extractable"]) })).toHaveLength(0);
  });

  it("builds overlapping ~900-char chunks and quotes FTS special characters", () => {
    const text = "word ".repeat(500);
    const chunks = buildKnowledgeChunks("file-chunks", { text });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 1_000)).toBe(true);

    const match = toFtsMatchQuery(['machine "learning"', "光合"]);
    expect(match).toContain('"machine ""learning"""');
    expect(match).toContain('"光合"');
    expect(toFtsMatchQuery(["", "   "])).toBe("");
  });
});
