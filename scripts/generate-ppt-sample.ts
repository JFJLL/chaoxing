import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import JSZip from "jszip";
import { generateArtifactPptx } from "../src/lib/courseWorkspace/exports/generateArtifactPptx";

const outputPath = resolve(process.argv[2] ?? "artifacts/verification/ppt-sample/course-production-chain-sample.pptx");
const templateBytes = await readFile(resolve("templates/courseware-template.pptx"));
const slides = [
  { title: "多资料形成课程目录", bullets: ["统一等待解析完成", "综合生成一份课程目录", "每份资料保留独立图谱"], speakerNotes: "演示多资料导入与一次保存。" },
  { title: "教案到AI课件", bullets: ["选择资料与具体章节", "确认教案后自动带入", "课件固定记录教案版本"], speakerNotes: "演示上游来源追溯。" },
  { title: "PPT编辑与发布", bullets: ["逐页编辑标题和要点", "保存形成可追溯版本", "只有最终PPT可以发布"], speakerNotes: "演示最终发布边界。" }
];
const buffer = await generateArtifactPptx({
  templateBytes,
  title: "备课中心生产链验收样例",
  courseTitle: "课程生产链",
  payload: { slides }
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, buffer);

const zip = await JSZip.loadAsync(buffer);
const presentation = await zip.file("ppt/presentation.xml")?.async("string");
const rels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
if (!presentation || !rels) throw new Error("样例 PPT 缺少 presentation 结构");
const relationshipTargets = new Map(
  [...rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="slides\/(slide\d+\.xml)"[^>]*\/?\s*>/g)]
    .map((match) => [match[1]!, match[2]!] as const)
);
const orderedIds = [...presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"[^>]*\/?\s*>/g)].map((match) => match[1]!);
if (orderedIds.length !== slides.length + 3) {
  throw new Error(`样例 PPT 页数错误：预期 ${slides.length + 3}，实际 ${orderedIds.length}`);
}
for (let index = 0; index < slides.length; index += 1) {
  const target = relationshipTargets.get(orderedIds[index + 2]!);
  const xml = target ? await zip.file(`ppt/slides/${target}`)?.async("string") : null;
  const visible = xml ? [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]?.trim()).filter(Boolean) : [];
  if (!visible.includes(slides[index]!.title) || visible.length < 2) {
    throw new Error(`样例 PPT 第 ${index + 3} 页缺少标题或可见要点`);
  }
}

console.log(`PPT_SAMPLE=${outputPath}`);
console.log(`PAGES=${orderedIds.length}`);
console.log(`BODY_SLIDES=${slides.length}`);
console.log("BODY_NON_EMPTY=3/3");
