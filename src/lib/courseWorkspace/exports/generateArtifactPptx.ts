import JSZip from "jszip";
import type { AiCoursewarePayload } from "@/types/courseWorkspace";

export type GenerateArtifactPptxInput = {
  templateBytes: Buffer;
  title: string;
  courseTitle: string;
  payload: AiCoursewarePayload;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function replaceTextRuns(xml: string, replacements: Array<string | undefined>) {
  let index = 0;
  return xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (match) => {
    const replacement = replacements[index++];
    return replacement === undefined ? match : `<a:t>${escapeXml(replacement)}</a:t>`;
  });
}

function textRuns(xml: string) {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1] ?? "");
}

function replaceMarkedRuns(xml: string, marker: (value: string) => boolean, replacements: string[]) {
  let index = 0;
  return xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (match, value: string) => {
    if (!marker(value)) return match;
    const replacement = replacements[index++] ?? "";
    return `<a:t>${escapeXml(replacement)}</a:t>`;
  });
}

function slideNumber(path: string) {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

async function findSlideByMarkers(
  zip: JSZip,
  predicate: (runs: string[]) => boolean
) {
  const paths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right));
  for (const path of paths) {
    const xml = await zip.file(path)?.async("string");
    if (xml && predicate(textRuns(xml))) return { path, number: slideNumber(path), xml };
  }
  return null;
}

const LOW_INFORMATION_BULLET_PREFIXES = [
  "欢迎来到",
  "欢迎进入",
  "大家好",
  "课程导入",
  "课堂导入"
] as const;

function clipText(value: string, maxLength: number) {
  const characters = Array.from(value.replace(/\s+/g, " ").trim());
  return characters.slice(0, maxLength).join("");
}

function bulletHeadline(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^([A-Za-z]+)（[^）]+）/, "$1");
  const leadingClause = normalized.split(/[，,；;。！？?!]/, 1)[0] ?? normalized;
  const separator = leadingClause.search(/[：:]/);
  const concisePrefix = separator >= 2 && separator <= 12
    ? leadingClause.slice(0, separator)
    : leadingClause.replace(/^(理解|掌握|梳理|认识|了解|分析|学习)/, "");
  return clipText(concisePrefix.replace(/的/g, ""), 12);
}

function slideHeader(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^第[一二三四五六七八九十百\d]+章\s*/, "")
    .replace(/概论$/, "");
  return clipText(normalized || value, 6);
}

function selectSlideHeadlines(bullets: string[]) {
  const normalized = bullets.map((bullet) => bullet.trim()).filter(Boolean);
  const informative = normalized.filter((bullet) => (
    !LOW_INFORMATION_BULLET_PREFIXES.some((prefix) => bullet.startsWith(prefix))
  ));
  const selected = informative.length >= 3 ? informative : normalized;
  return selected.slice(0, 3).map(bulletHeadline);
}

export function buildBodySlideReplacements(
  slide: AiCoursewarePayload["slides"][number]
) {
  const headlines = selectSlideHeadlines(slide.bullets);
  return [
    headlines[0] ?? "课程要点",
    "",
    headlines[1] ?? "核心概念",
    "",
    headlines[2] ?? "课堂提示",
    "",
    slideHeader(slide.title),
    ""
  ];
}

function relationshipIdForSlide(presentationRels: string, slideNumber: number) {
  const target = `slides/slide${slideNumber}.xml`;
  const expression = new RegExp(
    `<Relationship\\b[^>]*Id="([^"]+)"[^>]*Target="${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`
  );
  return presentationRels.match(expression)?.[1] ?? null;
}

function nextRelationshipNumber(presentationRels: string) {
  const values = [...presentationRels.matchAll(/\bId="rId(\d+)"/g)].map(
    (match) => Number(match[1])
  );
  return Math.max(0, ...values) + 1;
}

function nextSlideId(presentationXml: string) {
  const values = [...presentationXml.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g)].map(
    (match) => Number(match[1])
  );
  return Math.max(255, ...values) + 1;
}

function replaceSlideList(
  presentationXml: string,
  slideEntries: Array<{ id: number; relationshipId: string }>
) {
  const body = slideEntries
    .map(
      (entry) =>
        `<p:sldId id="${entry.id}" r:id="${entry.relationshipId}"/>`
    )
    .join("");
  return presentationXml.replace(
    /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
    `<p:sldIdLst>${body}</p:sldIdLst>`
  );
}

export async function generateArtifactPptx(input: GenerateArtifactPptxInput) {
  const zip = await JSZip.loadAsync(input.templateBytes);
  const presentationPath = "ppt/presentation.xml";
  const presentationRelsPath = "ppt/_rels/presentation.xml.rels";
  const contentTypesPath = "[Content_Types].xml";

  let presentationXml = await zip.file(presentationPath)?.async("string");
  let presentationRels = await zip.file(presentationRelsPath)?.async("string");
  let contentTypes = await zip.file(contentTypesPath)?.async("string");
  const [coverSlide, contentsSlide, bodySlide, thanksSlide] = await Promise.all([
    findSlideByMarkers(zip, (runs) => runs.includes("项目展示标题")),
    findSlideByMarkers(zip, (runs) => runs.includes("目录") && runs.some((value) => value.includes("NTENTS"))),
    findSlideByMarkers(zip, (runs) => runs.filter((value) => value === "输入标题").length >= 3 && runs.some((value) => value.startsWith("板式样式"))),
    findSlideByMarkers(zip, (runs) => runs.includes("THANKS"))
  ]);
  const bodyRelsPath = bodySlide ? `ppt/slides/_rels/slide${bodySlide.number}.xml.rels` : "";
  const bodyRels = bodyRelsPath ? await zip.file(bodyRelsPath)?.async("string") : null;

  if (
    !presentationXml ||
    !presentationRels ||
    !contentTypes ||
    !coverSlide ||
    !contentsSlide ||
    !bodySlide ||
    !bodyRels ||
    !thanksSlide
  ) {
    throw new Error("PPT 模板结构不完整");
  }
  let resolvedPresentationRels: string = presentationRels;
  let resolvedContentTypes: string = contentTypes;

  zip.file(
    coverSlide.path,
    replaceTextRuns(coverSlide.xml, ["", " ", input.title])
  );

  const contentsLabels = input.payload.slides.slice(0, 3).map((slide) => slide.title);
  zip.file(
    contentsSlide.path,
    replaceTextRuns(contentsSlide.xml, [
      "C",
      "O",
      "NTENTS",
      contentsLabels[0] ?? "课程导入",
      input.courseTitle,
      "01",
      contentsLabels[1] ?? "核心知识",
      input.courseTitle,
      "02",
      "目录",
      contentsLabels[2] ?? "课堂实践",
      input.payload.slides.length > 3
        ? `另有 ${input.payload.slides.length - 3} 页内容`
        : input.courseTitle,
      "03"
    ])
  );
  zip.file(thanksSlide.path, replaceTextRuns(thanksSlide.xml, ["THANKS", "谢谢"]));

  const coverRelationshipId = relationshipIdForSlide(resolvedPresentationRels, coverSlide.number);
  const contentsRelationshipId = relationshipIdForSlide(resolvedPresentationRels, contentsSlide.number);
  const thanksRelationshipId = relationshipIdForSlide(resolvedPresentationRels, thanksSlide.number);
  const firstBodyRelationshipId = relationshipIdForSlide(resolvedPresentationRels, bodySlide.number);
  if (
    !coverRelationshipId ||
    !contentsRelationshipId ||
    !thanksRelationshipId ||
    !firstBodyRelationshipId
  ) {
    throw new Error("PPT 模板页关系不完整");
  }

  const slideEntries: Array<{ id: number; relationshipId: string }> = [];
  let slideId = nextSlideId(presentationXml);
  slideEntries.push({ id: slideId++, relationshipId: coverRelationshipId });
  slideEntries.push({ id: slideId++, relationshipId: contentsRelationshipId });

  let relationshipNumber = nextRelationshipNumber(resolvedPresentationRels);
  let nextPhysicalSlide = Math.max(...Object.keys(zip.files).map(slideNumber)) + 1;
  input.payload.slides.forEach((slide, index) => {
    const headlines = selectSlideHeadlines(slide.bullets);
    let bodyXml = replaceMarkedRuns(
      bodySlide.xml,
      (value) => value === "输入标题",
      [headlines[0] ?? "课程要点", headlines[1] ?? "核心概念", headlines[2] ?? "课堂提示"]
    );
    bodyXml = replaceMarkedRuns(bodyXml, (value) => value.startsWith("输入内文"), ["", "", ""]);
    bodyXml = replaceMarkedRuns(bodyXml, (value) => value.startsWith("板式样式"), [slide.title]);
    bodyXml = replaceMarkedRuns(bodyXml, (value) => value === "BANSHIYANGSHIYI", [""]);
    if (!textRuns(bodyXml).some((value) => value.trim() === slide.title.trim())
      || !textRuns(bodyXml).some((value) => headlines.includes(value) && Boolean(value.trim()))) {
      throw new Error(`PPT 正文页“${slide.title}”缺少可见标题或要点`);
    }
    if (index === 0) {
      zip.file(
        bodySlide.path,
        bodyXml
      );
      slideEntries.push({
        id: slideId++,
        relationshipId: firstBodyRelationshipId
      });
      return;
    }

    const physicalSlide = nextPhysicalSlide++;
    const relationshipId = `rId${relationshipNumber++}`;
    zip.file(
      `ppt/slides/slide${physicalSlide}.xml`,
      bodyXml
    );
    zip.file(`ppt/slides/_rels/slide${physicalSlide}.xml.rels`, bodyRels);
    resolvedPresentationRels = resolvedPresentationRels.replace(
      "</Relationships>",
      `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${physicalSlide}.xml"/></Relationships>`
    );
    resolvedContentTypes = resolvedContentTypes.replace(
      "</Types>",
      `<Override PartName="/ppt/slides/slide${physicalSlide}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`
    );
    slideEntries.push({ id: slideId++, relationshipId });
  });

  slideEntries.push({ id: slideId++, relationshipId: thanksRelationshipId });
  presentationXml = replaceSlideList(presentationXml, slideEntries);
  zip.file(presentationPath, presentationXml);
  zip.file(presentationRelsPath, resolvedPresentationRels);
  zip.file(contentTypesPath, resolvedContentTypes);

  return Buffer.from(
    await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    })
  );
}
