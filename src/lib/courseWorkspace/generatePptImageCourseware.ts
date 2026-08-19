import sharp from "sharp";
import { AiServiceError } from "@/lib/ai/errors";
import { generateKeystoneSlideImage } from "@/lib/ai/keystoneImageClient";
import { consumeReservedCredits, releaseReservedCredits } from "@/lib/billing/credit-service";
import { db } from "@/lib/db";
import { storeGeneratedCoursewareImage } from "@/lib/storage";
import { aiCoursewarePayloadSchema, type AiCoursewarePayload } from "@/types/courseWorkspace";

function buildSlideImagePrompt(input: {
  courseTitle: string;
  slideNo: number;
  totalSlides: number;
  title: string;
  bullets: string[];
  speakerNotes: string;
}) {
  const isChapterCover = input.slideNo === 1;
  const pageBrief = isChapterCover
    ? "这是正式课程章节首页。大标题突出章节名称；以课程名称、本章要点、学习目标组成清晰的三条信息；画面庄重、开阔、有仪式感。"
    : "这是章节内教学内容页。用清晰的标题、三个要点和与教学内容匹配的结构化图形、示意图或案例插画组织信息。";
  return [
    "生成一张 16:9 横向教学 PPT 的完整单页视觉画面。",
    "视觉必须严格参照课程模板：温暖白色或浅灰白背景，主色为中国红 #C92E2E，辅助色为教育蓝 #1D5FAF 和生态绿 #118A45；采用红、蓝、绿三色平滑飘带或弧线作为角落装饰，搭配克制的浅灰点阵或细网格纹理。整体是中国高校课程课件风格，正式、清爽、专业，留白充足，绝不能使用蓝色为整页主背景。",
    pageBrief,
    "必须是完整页面设计，不要输出零散素材，不要添加水印，不要添加任何品牌 Logo。右上角保留约 12% 宽度的干净留白供系统叠加真实 Logo。",
    "绝对禁止出现任何页码、页数、幻灯片编号、‘第几页’、‘第x/x页’、‘x/y’、页脚进度条或类似序号文字。不要自行添加目录、日期、单位、人物、机构、数据或结论。",
    "中文文本要准确、简洁、可读；页面只渲染下面提供的教学文字。",
    `课程：${input.courseTitle}`,
    `页面标题：${input.title}`,
    `教学要点：${input.bullets.map((bullet, index) => `${index + 1}. ${bullet}`).join("；")}`,
    `讲解意图：${input.speakerNotes}`
  ].join("\n");
}

async function releaseOutstandingBatchCredits(input: {
  userId: string;
  artifactId: string;
  pages: Array<{ pageNo: number; creditReferenceId: string }>;
  reason: string;
}) {
  for (const page of input.pages) {
    await releaseReservedCredits({
      userId: input.userId,
      amount: 1,
      referenceType: "PPT_PAGE",
      referenceId: page.creditReferenceId,
      description: input.reason,
      metadata: { artifactId: input.artifactId, pageNo: page.pageNo }
    });
  }
}

export async function generatePptImageCourseware(input: {
  artifactId: string;
  sourceCourseware: AiCoursewarePayload;
}) {
  const artifact = await db.courseAiArtifact.findUnique({
    where: { id: input.artifactId },
    select: { id: true, courseId: true, userId: true, title: true }
  });
  if (!artifact) throw new AiServiceError("MODEL_REQUEST_FAILED", "课件任务不存在");
  const batch = await db.imageGenerationBatch.findUnique({
    where: { artifactId: artifact.id },
    include: { pages: { orderBy: { pageNo: "asc" } } }
  });
  if (!batch) throw new AiServiceError("MODEL_REQUEST_FAILED", "课件图片批次不存在");

  await db.imageGenerationBatch.update({ where: { id: batch.id }, data: { status: "GENERATING" } });
  const slides = input.sourceCourseware.slides.map((slide) => ({ ...slide }));

  for (const page of batch.pages) {
    if (page.status === "SUCCEEDED" && page.imagePath) {
      const target = slides[page.pageNo - 1];
      if (target) target.imagePath = `/api/courses/${artifact.courseId}/ai-artifacts/${artifact.id}/pages/${page.pageNo}/image`;
      continue;
    }
    if (page.status === "FAILED") {
      throw new AiServiceError("IMAGE_PROVIDER_REQUEST_FAILED", "存在生成失败页面，请重新生成该页");
    }

    try {
      await db.imageGenerationPage.update({ where: { id: page.id }, data: { status: "GENERATING", errorCode: null, errorMessage: null } });
      const sourceSlide = input.sourceCourseware.slides[page.pageNo - 1];
      if (!sourceSlide) throw new AiServiceError("MODEL_INVALID_OUTPUT", "课件来源页与图像任务不一致");
      // 重新生成也使用当前的视觉规范，避免历史任务保留旧版蓝色或页码提示。
      const generated = await generateKeystoneSlideImage(buildSlideImagePrompt({
        courseTitle: artifact.title,
        slideNo: page.pageNo,
        totalSlides: batch.plannedPages,
        title: sourceSlide.title,
        bullets: sourceSlide.bullets,
        speakerNotes: sourceSlide.speakerNotes
      }));
      const png = await sharp(generated.bytes).png().toBuffer();
      const imagePath = await storeGeneratedCoursewareImage({ artifactId: artifact.id, pageNo: page.pageNo, bytes: png });
      await db.imageGenerationPage.update({
        where: { id: page.id },
        data: { status: "SUCCEEDED", imagePath, providerTaskId: generated.providerAssetUrl ?? null }
      });
      await consumeReservedCredits({
        userId: artifact.userId,
        amount: 1,
        referenceType: "PPT_PAGE",
        referenceId: page.creditReferenceId,
        description: `课件第 ${page.pageNo} 页图像生成成功`,
        metadata: { artifactId: artifact.id, pageNo: page.pageNo }
      });
      await db.imageGenerationPage.update({ where: { id: page.id }, data: { consumedAt: new Date() } });
      const target = slides[page.pageNo - 1];
      if (target) target.imagePath = `/api/courses/${artifact.courseId}/ai-artifacts/${artifact.id}/pages/${page.pageNo}/image`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "图像生成失败";
      await db.imageGenerationPage.update({
        where: { id: page.id },
        data: { status: "FAILED", errorCode: "IMAGE_PROVIDER_REQUEST_FAILED", errorMessage: message.slice(0, 500) }
      });
      const latest = await db.imageGenerationBatch.findUnique({
        where: { id: batch.id },
        include: { pages: true }
      });
      const unconsumed = latest?.pages
        .filter((item) => item.status !== "SUCCEEDED" && !item.consumedAt)
        .map((item) => ({ pageNo: item.pageNo, creditReferenceId: item.creditReferenceId })) ?? [];
      await releaseOutstandingBatchCredits({
        userId: artifact.userId,
        artifactId: artifact.id,
        pages: unconsumed,
        reason: "课件图片生成失败，已退回未生成页面积分"
      });
      await db.imageGenerationBatch.update({ where: { id: batch.id }, data: { status: "FAILED" } });
      throw error instanceof AiServiceError
        ? error
        : new AiServiceError("IMAGE_PROVIDER_REQUEST_FAILED", "图像服务生成失败，未生成页面的积分已退回");
    }
  }

  await db.imageGenerationBatch.update({ where: { id: batch.id }, data: { status: "COMPLETED" } });
  return aiCoursewarePayloadSchema.parse({ slides });
}

export function createPptImagePagePrompt(input: {
  courseTitle: string;
  slideNo: number;
  totalSlides: number;
  title: string;
  bullets: string[];
  speakerNotes: string;
}) {
  return buildSlideImagePrompt(input);
}
