import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { CreditError, reserveCreditsInTransaction } from "@/lib/billing/credit-service";
import { db } from "@/lib/db";
import { enqueueAiGenerationJob } from "@/lib/courseWorkspace/aiGenerationQueue";
import { requireCourseManager } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string; artifactId: string; pageNo: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId, pageNo } = await context.params;
  const number = Number(pageNo);
  if (!Number.isInteger(number) || number < 1 || number > 200) return NextResponse.json({ error: "页面编号无效" }, { status: 400 });
  try {
    await requireCourseManager(user, courseId);
    if (user.role !== "TEACHER") return NextResponse.json({ error: "仅教师账户可以重新生成课件页面" }, { status: 403 });

    const artifact = await db.$transaction(async (tx) => {
      const current = await tx.courseAiArtifact.findFirst({
        where: { id: artifactId, courseId, appType: "ppt_courseware", userId: user.id, deletedAt: null },
        select: { id: true, status: true }
      });
      if (!current) throw new Error("课件不存在或无权操作");
      if (["QUEUED", "GENERATING"].includes(current.status)) throw new Error("课件正在生成，请稍后再试");
      const page = await tx.imageGenerationPage.findFirst({
        where: { pageNo: number, batch: { artifactId: current.id } },
        select: { id: true }
      });
      if (!page) throw new Error("课件页面不存在");
      const creditReferenceId = `${current.id}:page:${number}:regen:${randomUUID()}`;
      await reserveCreditsInTransaction(tx, {
        userId: user.id,
        amount: 1,
        referenceType: "PPT_REGEN",
        referenceId: creditReferenceId,
        description: `重新生成课件第 ${number} 页，已冻结积分`,
        metadata: { artifactId: current.id, pageNo: number }
      });
      await tx.imageGenerationPage.update({
        where: { id: page.id },
        data: {
          status: "QUEUED",
          imagePath: null,
          errorCode: null,
          errorMessage: null,
          providerTaskId: null,
          consumedAt: null,
          creditReferenceId
        }
      });
      await tx.imageGenerationBatch.update({ where: { artifactId: current.id }, data: { status: "QUEUED" } });
      await tx.courseAiArtifact.update({
        where: { id: current.id },
        data: { status: "QUEUED", payload: null, errorCode: null, errorMessage: null, runToken: null, startedAt: null, finishedAt: null }
      });
      return current;
    });
    enqueueAiGenerationJob(artifact.id);
    return NextResponse.json({ ok: true, artifactId: artifact.id, pageNo: number }, { status: 202 });
  } catch (error) {
    if (error instanceof CreditError) return NextResponse.json({ code: error.code, error: error.message }, { status: 402 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "重新生成请求失败" }, { status: 409 });
  }
}
