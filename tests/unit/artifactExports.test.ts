import { readFile } from "fs/promises";
import { resolve } from "path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { generateArtifactDocx } from "@/lib/courseWorkspace/exports/generateArtifactDocx";
import {
  buildBodySlideReplacements,
  generateArtifactPptx
} from "@/lib/courseWorkspace/exports/generateArtifactPptx";

describe("AI artifact export generators", () => {
  it("keeps PPT body slides to three concise headlines without overlapping detail text", () => {
    const replacements = buildBodySlideReplacements({
      title: "第一章 文化市场营销概论",
      bullets: [
        "欢迎来到《文化市场营销》课堂",
        "本章学习目标：掌握市场营销的基本概念与核心理论",
        "理解文化市场的特殊性与运行规律",
        "梳理市场营销观念的历史演变，奠定理论基础"
      ],
      speakerNotes: "完整讲解放在备注中。"
    });

    expect(replacements.filter((_, index) => [1, 3, 5, 7].includes(index))).toEqual(["", "", "", ""]);
    expect(replacements[0]).toBe("本章学习目标");
    expect(replacements).not.toContain("欢迎来到《文化市场营销》课堂");
    expect(Array.from(replacements[2] ?? "").length).toBeLessThanOrEqual(12);
    expect(Array.from(replacements[4] ?? "").length).toBeLessThanOrEqual(12);
    expect(replacements[6]).toBe("文化市场营销");
    expect(replacements.join("")).not.toContain("…");
  });

  it("generates a student question DOCX without answers or explanations", async () => {
    const buffer = await generateArtifactDocx({
      appType: "question_generation",
      title: "课堂练习",
      courseTitle: "文化产业管理",
      variant: "student",
      payload: {
        questions: [
          {
            type: "single_choice",
            stem: "文化产品的基本特征是什么？",
            options: ["文化价值与经济价值并存", "只具有经济价值"],
            answer: "A",
            explanation: "文化产品兼具文化属性与商品属性。"
          }
        ]
      }
    });

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("文化产品的基本特征是什么");
    expect(documentXml).not.toContain("参考答案");
    expect(documentXml).not.toContain("文化产品兼具文化属性");
  });

  it("generates a teacher question DOCX with answers and explanations", async () => {
    const buffer = await generateArtifactDocx({
      appType: "question_generation",
      title: "课堂练习",
      courseTitle: "文化产业管理",
      variant: "teacher",
      payload: {
        questions: [
          {
            type: "short_answer",
            stem: "简述文化产业的双重属性。",
            answer: "文化属性与经济属性。",
            explanation: "需要同时说明社会价值与市场价值。"
          }
        ]
      }
    });

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("参考答案");
    expect(documentXml).toContain("文化属性与经济属性");
    expect(documentXml).toContain("需要同时说明社会价值");
  });

  it("reuses the provided PPT template and creates one body slide per courseware slide", async () => {
    const templatePath =
      process.env.PPT_COURSEWARE_TEMPLATE_PATH
      ?? resolve("templates", "courseware-template.pptx");
    const templateBytes = await readFile(templatePath);

    const buffer = await generateArtifactPptx({
      templateBytes,
      title: "数字文化产业课件",
      courseTitle: "文化产业管理",
      payload: {
        slides: [
          {
            title: "课程概览",
            bullets: ["教学目标", "核心概念", "课堂任务"],
            speakerNotes: "结合案例讲解"
          },
          {
            title: "案例分析",
            bullets: ["背景", "问题", "策略", "反思"],
            speakerNotes: "组织小组讨论"
          }
        ]
      }
    });

    const zip = await JSZip.loadAsync(buffer);
    const presentationXml = await zip
      .file("ppt/presentation.xml")
      ?.async("string");
    const slide1Xml = await zip.file("ppt/slides/slide1.xml")?.async("string");
    const slide4Xml = await zip.file("ppt/slides/slide4.xml")?.async("string");
    const clonedSlideXml = await zip
      .file("ppt/slides/slide10.xml")
      ?.async("string");

    expect(presentationXml?.match(/<p:sldId\b/g)).toHaveLength(5);
    expect(slide1Xml).toContain("数字文化产业课件");
    expect(slide4Xml).toContain("课程概览");
    expect(clonedSlideXml).toContain("案例分析");
    expect(clonedSlideXml).not.toContain("输入标题");
    for (const xml of [slide4Xml, clonedSlideXml]) {
      const visible = [...(xml ?? "").matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]?.trim()).filter(Boolean);
      expect(visible.length).toBeGreaterThanOrEqual(2);
      expect(visible.some((value) => value?.startsWith("输入内文"))).toBe(false);
    }
  });

  it("finds a semantic body placeholder page instead of assuming physical slide 4", async () => {
    const templatePath = process.env.PPT_COURSEWARE_TEMPLATE_PATH ?? resolve("templates", "courseware-template.pptx");
    const template = await JSZip.loadAsync(await readFile(templatePath));
    const slide4 = await template.file("ppt/slides/slide4.xml")?.async("string");
    expect(slide4).toBeTruthy();
    template.file("ppt/slides/slide4.xml", slide4!.replace(/输入标题/g, "旧版占位"));
    const modifiedTemplate = await template.generateAsync({ type: "nodebuffer" });

    const buffer = await generateArtifactPptx({
      templateBytes: modifiedTemplate,
      title: "语义占位验收",
      courseTitle: "课程",
      payload: { slides: [{ title: "稳定正文", bullets: ["可见要点一", "可见要点二", "可见要点三"], speakerNotes: "备注" }] }
    });
    const output = await JSZip.loadAsync(buffer);
    const presentation = await output.file("ppt/presentation.xml")?.async("string");
    const relationships = await output.file("ppt/_rels/presentation.xml.rels")?.async("string");
    const slide5Relationship = relationships?.match(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="slides\/slide5\.xml"/)?.[1];
    expect(slide5Relationship).toBeTruthy();
    expect(presentation).toContain(`r:id="${slide5Relationship}"`);
    expect(await output.file("ppt/slides/slide5.xml")?.async("string")).toContain("稳定正文");
  });
});
