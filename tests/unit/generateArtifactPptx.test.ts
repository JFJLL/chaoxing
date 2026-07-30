import { readFile } from "fs/promises";
import { join } from "path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { generateArtifactPptx } from "@/lib/courseWorkspace/exports/generateArtifactPptx";
import type { AiCoursewarePayload } from "@/types/courseWorkspace";

async function templateBytes() {
  return readFile(join(process.cwd(), "templates", "courseware-template.pptx"));
}

function makeSlide(title: string): AiCoursewarePayload["slides"][number] {
  return { title, bullets: ["要点一：概述与背景", "要点二：核心概念", "要点三：课堂实践"], speakerNotes: "讲稿" };
}

async function contentsRuns(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const path = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();
  for (const name of path) {
    const xml = (await zip.file(name)?.async("string")) ?? "";
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1] ?? "");
    if (runs.includes("目录") && runs.some((value) => value.includes("NTENTS"))) return runs;
  }
  return [];
}

describe("generateArtifactPptx contents page", () => {
  it("puts a short headline in the small title box and the full title in the body box", async () => {
    const longTitle = "第一章 文化市场营销概论：从4P到4I的演变与实践";
    const payload: AiCoursewarePayload = {
      slides: [makeSlide(longTitle), makeSlide("市场营销的整体认识：定义与本质"), makeSlide("核心营销理论")]
    };

    const bytes = await generateArtifactPptx({
      templateBytes: await templateBytes(),
      title: "文化市场营销课件",
      courseTitle: "文化市场营销",
      payload
    });

    const runs = await contentsRuns(bytes);
    // The title-box run (index 3) must be a short, single-line headline — never
    // the full long title, which is what used to wrap and overlap.
    const titleBox = runs[3] ?? "";
    expect(titleBox.length).toBeGreaterThan(0);
    expect(titleBox.length).toBeLessThanOrEqual(8);
    expect(runs).not.toContain(longTitle);
    // The body box (index 4) carries the descriptive title, clipped.
    expect(runs[4] ?? "").toContain("文化市场营销");
    // Number blocks are preserved.
    expect(runs).toEqual(expect.arrayContaining(["01", "02", "03"]));
  });
});
