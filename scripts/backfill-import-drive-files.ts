import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { db } from "../src/lib/db";
import { ensureCoursePurposeFolder } from "../src/lib/courseDrive/service";
import { storeDriveFile } from "../src/lib/modules/driveFiles";
import { withImportFilePath } from "../src/lib/storage";

const apply = process.argv.includes("--apply");
async function main() {
const jobs = await db.documentImportJob.findMany({
  where: { driveFileId: null, deletedAt: null },
  orderBy: { createdAt: "asc" },
  include: {
    course: {
      include: { owner: { select: { id: true, name: true, role: true, institutionId: true } } }
    }
  }
});
const report = { mode: apply ? "apply" : "dry-run", scanned: jobs.length, linked: 0, reused: 0, created: 0, missing: [] as Array<{ jobId: string; filePath: string | null; error: string }> };

for (const job of jobs) {
  try {
    if (!job.filePath) throw new Error("缺少 filePath");
    const bytes = await withImportFilePath(job.filePath, (localPath) => readFile(localPath));
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    if (!apply) continue;
    const owner = {
      id: job.course.owner.id,
      name: job.course.owner.name,
      role: job.course.owner.role as "STUDENT" | "TEACHER" | "ADMIN",
      institutionId: job.course.owner.institutionId
    };
    const folder = await ensureCoursePurposeFolder(owner, job.courseId, "COURSE_DOCUMENTS");
    let driveFile = await db.driveFile.findFirst({
      where: { ownerId: folder.ownerId, parentId: folder.id, kind: "file", contentHash, deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    if (driveFile) {
      report.reused += 1;
    } else {
      const path = await storeDriveFile({ ownerId: folder.ownerId, fileName: job.originalName, bytes, mimeType: job.mimeType });
      driveFile = await db.driveFile.create({
        data: {
          ownerId: folder.ownerId,
          parentId: folder.id,
          name: job.originalName,
          kind: "file",
          mimeType: job.mimeType,
          size: bytes.length,
          path,
          contentHash,
          extractionStatus: job.extractedText ? "READY" : "PENDING",
          extractedText: job.extractedText,
          extractedAt: job.extractedText ? job.updatedAt : null
        }
      });
      report.created += 1;
    }
    await db.documentImportJob.update({
      where: { id: job.id },
      data: { driveFileId: driveFile.id, filePath: driveFile.path, contentHash }
    });
    report.linked += 1;
  } catch (error) {
    report.missing.push({
      jobId: job.id,
      filePath: job.filePath,
      error: error instanceof Error ? error.message : "文件校验失败"
    });
  }
}

console.log(JSON.stringify(report, null, 2));
await db.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await db.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
