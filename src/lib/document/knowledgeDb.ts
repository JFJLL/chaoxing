import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import type { ExtractedDocument } from "@/lib/document/extractText";
import { splitIntoOverlappingChunks } from "@/lib/document/normalizeText";

export const KNOWLEDGE_CHUNK_SIZE = 900;
export const KNOWLEDGE_CHUNK_OVERLAP = 100;
export const KNOWLEDGE_SEARCH_LIMIT = 30;
export const KNOWLEDGE_SEARCH_LIMIT_MAX = 50;

export type KnowledgeChunk = {
  fileId: string;
  page: number;
  content: string;
};

export type KnowledgeHit = KnowledgeChunk;

let database: Database.Database | null = null;

/**
 * The knowledge database is intentionally decoupled from the Prisma business
 * database: it is a local SQLite file holding only the FTS5 chunk index.
 * Override the location with KNOWLEDGE_DB_PATH (used by tests as well).
 */
export function getKnowledgeDbPath() {
  return process.env.KNOWLEDGE_DB_PATH || join(process.cwd(), ".data", "knowledge.db");
}

export function getKnowledgeDb(): Database.Database {
  if (database) return database;
  const path = getKnowledgeDbPath();
  mkdirSync(dirname(path), { recursive: true });
  database = new Database(path);
  database.pragma("journal_mode = WAL");
  // porter provides English stemming (searching "produce" also matches
  // "production"); unicode61 keeps CJK characters tokenisable. fileId/page are
  // UNINDEXED so only the content contributes to relevance ranking.
  database.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(" +
      "fileId UNINDEXED, page UNINDEXED, content, tokenize='porter unicode61');"
  );
  return database;
}

/** Closes the cached connection (mainly for tests). */
export function closeKnowledgeDb() {
  database?.close();
  database = null;
}

/**
 * Splits an extracted document into knowledge chunks. PDFs keep their 1-based
 * page number; formats without pages fall back to page 0.
 */
export function buildKnowledgeChunks(
  fileId: string,
  document: Pick<ExtractedDocument, "text" | "pageChunks">
): KnowledgeChunk[] {
  if (!document.text || !document.text.trim()) return [];
  const chunks = document.pageChunks?.length
    ? document.pageChunks
    : splitIntoOverlappingChunks(document.text, KNOWLEDGE_CHUNK_SIZE, KNOWLEDGE_CHUNK_OVERLAP)
        .map((text) => ({ text, page: 0 }));
  return chunks.map(({ text, page }) => ({ fileId, page, content: text }));
}

/**
 * Replaces the FTS5 rows of one file with the full set of its chunks
 * (idempotent: re-importing or re-extracting a file refreshes the index).
 */
export function indexKnowledgeDocument(
  fileId: string,
  document: Pick<ExtractedDocument, "text" | "pageChunks">
) {
  const database = getKnowledgeDb();
  const remove = database.prepare("DELETE FROM chunk_fts WHERE fileId = ?");
  const chunks = buildKnowledgeChunks(fileId, document);
  if (!chunks.length) {
    // A rebuild with no extractable text (e.g. a re-imported scanned PDF)
    // must still clear stale rows from a previous version of the file.
    remove.run(fileId);
    return 0;
  }
  const insert = database.prepare("INSERT INTO chunk_fts (fileId, page, content) VALUES (?, ?, ?)");
  const apply = database.transaction((rows: KnowledgeChunk[]) => {
    remove.run(fileId);
    for (const row of rows) insert.run(row.fileId, row.page, row.content);
    return rows.length;
  });
  return apply(chunks);
}

/** Removes every chunk of a file (used when a file is deleted or unsupported). */
export function removeKnowledgeDocument(fileId: string) {
  const database = getKnowledgeDb();
  return database.prepare("DELETE FROM chunk_fts WHERE fileId = ?").run(fileId).changes;
}

export function hasKnowledgeDocument(fileId: string) {
  const database = getKnowledgeDb();
  return database.prepare("SELECT 1 FROM chunk_fts WHERE fileId = ? LIMIT 1").get(fileId) !== undefined;
}

/**
 * Turns user/LLM terms into a safe FTS5 MATCH expression. Every term is quoted
 * (FTS5 phrase semantics, including CJK bigrams) and OR-joined so a single
 * matching keyword still returns candidates; the LLM re-ranker filters noise.
 */
export function toFtsMatchQuery(terms: string[]) {
  const cleaned = [...new Set(
    terms
      .map((term) => term.trim())
      .filter((term) => term.length >= 1 && term.length <= 60)
  )].slice(0, 12);
  if (!cleaned.length) return "";
  return cleaned.map((term) => `"${term.replace(/"/g, "\"\"")}"`).join(" OR ");
}

export function searchKnowledgeChunks(input: {
  fileIds: string[];
  match: string;
  /**
   * Plain CJK substrings (e.g. Chinese bigrams). unicode61 indexes a whole
   * CJK run as one token, so MATCH cannot find mid-run Chinese terms; these
   * substrings are used as a LIKE fallback so Chinese questions still hit.
   */
  substrings?: string[];
  limit?: number;
}): KnowledgeHit[] {
  const fileIds = [...new Set(input.fileIds)];
  if (!fileIds.length) return [];
  const database = getKnowledgeDb();
  const limit = Math.max(1, Math.min(KNOWLEDGE_SEARCH_LIMIT_MAX, input.limit ?? KNOWLEDGE_SEARCH_LIMIT));
  const placeholders = fileIds.map(() => "?").join(",");
  const scope = `fileId IN (${placeholders})`;
  const hits: KnowledgeHit[] = [];
  if (input.match) {
    const rows = database.prepare(
      `SELECT fileId, page, content FROM chunk_fts WHERE chunk_fts MATCH ? AND ${scope} ORDER BY rank LIMIT ?`
    ).all(input.match, ...fileIds, limit) as unknown[];
    hits.push(...rows.map((row) => row as KnowledgeHit));
  }
  const substrings = [...new Set(
    (input.substrings ?? [])
      .map((term) => term.trim())
      .filter((term) => term.length >= 2 && term.length <= 40)
  )].slice(0, 6);
  if (substrings.length) {
    const seen = new Set(hits.map((hit) => `${hit.fileId}\u0000${hit.page}\u0000${hit.content}`));
    const likeWhere = substrings.map(() => "content LIKE ?").join(" AND ");
    const likeRows = database.prepare(
      `SELECT fileId, page, content FROM chunk_fts WHERE ${likeWhere} AND ${scope} ORDER BY rowid LIMIT ?`
    ).all(...substrings.map((term) => `%${term}%`), ...fileIds, limit) as unknown[];
    for (const row of likeRows) {
      const hit = row as KnowledgeHit;
      const key = `${hit.fileId}\u0000${hit.page}\u0000${hit.content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
      if (hits.length >= limit) break;
    }
  }
  return hits.slice(0, limit);
}
