import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUploadDir } from "@/lib/storage";
import { extractText } from "@/lib/document/extractText";
import { buildPlagiarismReport } from "@/lib/modules/plagiarismReport";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  const checks = await db.plagiarismCheck.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ checks });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请上传检测文档" }, { status: 400 });
  const dir = join(getUploadDir(), "plagiarism");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${Date.now()}-${file.name}`);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  const check = await db.plagiarismCheck.create({ data: { ownerId: user.id, title: file.name, filePath, status: "CHECKING" } });
  try {
    const extracted = await extractText(filePath, file.type);
    const previous = await db.plagiarismCheck.findMany({ where: { ownerId: user.id, reportJson: { not: null } }, take: 5 });
    const report = buildPlagiarismReport(extracted.text, [
      { source: "馆员培训样例库", text: "活动目标、用户分层、宣传渠道、复盘指标、借阅数据、访问数据、用户反馈。" },
      ...previous.map((item) => ({ source: item.title, text: item.reportJson || "" }))
    ]);
    const updated = await db.plagiarismCheck.update({ where: { id: check.id }, data: { status: "COMPLETED", similarity: report.similarity, riskLevel: report.riskLevel, reportJson: JSON.stringify(report) } });
    return NextResponse.json({ check: updated }, { status: 201 });
  } catch (error) {
    await db.plagiarismCheck.update({ where: { id: check.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "检测失败" } });
    throw error;
  }
}
