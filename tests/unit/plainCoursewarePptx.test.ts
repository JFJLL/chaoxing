import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { generatePlainCoursewarePptx } from "@/lib/courseWorkspace/exports/plainCoursewarePptx";
import type { AiCoursewarePayload } from "@/types/courseWorkspace";

const payload: AiCoursewarePayload = {
  slides: [
    { title: "习近平文化思想的科学体系与形成背景", bullets: ["时代变局与复兴全局交织碰撞", "总结新时代党领导文化建设经验"], speakerNotes: "讲稿一" },
    { title: "坚持党的文化领导权", bullets: ["文化关乎国本国运"], speakerNotes: "讲稿二" }
  ]
};

describe("generatePlainCoursewarePptx", () => {
  it("produces a valid, self-contained pptx with one slide per payload entry and no template parts", async () => {
    const bytes = await generatePlainCoursewarePptx({ payload });
    const zip = await JSZip.loadAsync(bytes);
    const parts = Object.keys(zip.files);

    // Required OOXML scaffolding is present.
    for (const required of [
      "[Content_Types].xml",
      "_rels/.rels",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/theme/theme1.xml",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideLayouts/slideLayout1.xml"
    ]) {
      expect(parts).toContain(required);
    }

    // Exactly one slide per payload entry — no leftover template slides.
    const slideParts = parts.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
    expect(slideParts).toHaveLength(2);

    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";
    expect(slide1).toContain("习近平文化思想的科学体系与形成背景");
    expect(slide1).toContain("时代变局与复兴全局交织碰撞");
    // References the plain blank layout, never the branded template.
    const rels1 = (await zip.file("ppt/slides/_rels/slide1.xml.rels")?.async("string")) ?? "";
    expect(rels1).toContain("slideLayout1.xml");
  });

  it("escapes XML-special characters in titles and bullets", async () => {
    const bytes = await generatePlainCoursewarePptx({
      payload: { slides: [{ title: "A & B <C>", bullets: ["x < y & z"], speakerNotes: "" }] }
    });
    const zip = await JSZip.loadAsync(bytes);
    const slide = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";
    expect(slide).toContain("A &amp; B &lt;C&gt;");
    expect(slide).not.toContain("A & B <C>");
  });
});
