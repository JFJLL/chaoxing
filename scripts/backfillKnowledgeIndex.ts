/**
 * One-time maintenance script: backfills the local FTS5 knowledge index for
 * files that were extracted before the knowledge database existed (legacy
 * drive files and imports). Run after deploying the FTS retrieval feature so
 * the first AI tutor question does not wait for a lazy background index.
 *
 * Usage: npx tsx scripts/backfillKnowledgeIndex.ts
 */
import { PrismaClient } from "@prisma/client";
import { extractText } from "../src/lib/document/extractText";
import { hasKnowledgeDocument, indexKnowledgeDocument } from "../src/lib/document/knowledgeDb";
import { withDriveFilePath } from "../src/lib/modules/driveFiles";
import { withImportFilePath } from "../src/lib/storage";

const db = new PrismaClient();

async function backfillDriveFiles() {
  const files = await db.driveFile.findMany({
    where: { kind: "file", extractionStatus: "READY", deletedAt: null },
    select: { id: true, name: true, mimeType: true }
  });
  let indexed = 0;
  for (const file of files) {
    if (hasKnowledgeDocument(file.id)) continue;
    process.stdout.write(`索引云盘文件 ${file.name} ... `);
    try {
      await withDriveFilePath(file as Parameters<typeof withDriveFilePath>[0], async (localPath) => {
        const extracted = await extractText(localPath, file.mimeType);
        indexKnowledgeDocument(file.id, extracted);
      });
      console.log("完成");
      indexed += 1;
    } catch (error) {
      console.log(`失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }
  return indexed;
}

async function backfillImports() {
  const jobs = await db.documentImportJob.findMany({
    where: { driveFileId: null, extractedText: { not: null }, deletedAt: null },
    select: { id: true, originalName: true, extractedText: true, filePath: true }
  });
  let indexed = 0;
  for (const job of jobs) {
    if (hasKnowledgeDocument(job.id)) continue;
    process.stdout.write(`索引导入文档 ${job.originalName} ... `);
    try {
      if (job.extractedText) {
        indexKnowledgeDocument(job.id, { text: job.extractedText });
        console.log("完成");
        indexed += 1;
        continue;
      }
      if (job.filePath) {
        await withImportFilePath(job.filePath, async (localPath) => {
          const extracted = await extractText(localPath);
          indexKnowledgeDocument(job.id, extracted);
        });
        console.log("完成");
        indexed += 1;
        continue;
      }
      console.log("跳过（无文本）");
    } catch (error) {
      console.log(`失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }
  return indexed;
}

async function main() {
  const driveCount = await backfillDriveFiles();
  const importCount = await backfillImports();
  console.log(`知识库回填完成：云盘 ${driveCount} 个，导入 ${importCount} 个。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
