import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  CopilotSkillPackageError,
  parseCopilotSkillPackage
} from "@/lib/copilot/skillPackage";

const skill = `---\nname: 案例分析\ndescription: 按结构分析课程案例\n---\n\n# 指令\n结合用户问题进行分析。`;

describe("Copilot Skill package", () => {
  it("parses a single Markdown skill", async () => {
    await expect(parseCopilotSkillPackage(new File([skill], "analysis.md", { type: "text/markdown" }))).resolves.toMatchObject({
      name: "案例分析",
      description: "按结构分析课程案例",
      originalName: "analysis.md",
      instructions: expect.stringContaining("结合用户问题")
    });
  });

  it("parses root SKILL.md and text references from ZIP", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", skill);
    zip.file("references/rubric.txt", "先判断背景，再给出建议。");
    const bytes = Uint8Array.from(await zip.generateAsync({ type: "uint8array" }));
    const parsed = await parseCopilotSkillPackage(new File([bytes.buffer], "analysis.zip", { type: "application/zip" }));

    expect(parsed.instructions).toContain("参考文件：references/rubric.txt");
    expect(parsed.instructions).toContain("先判断背景");
  });

  it("rejects executable files inside ZIP", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", skill);
    zip.file("scripts/run.js", "process.exit(0)");
    const bytes = Uint8Array.from(await zip.generateAsync({ type: "uint8array" }));

    await expect(parseCopilotSkillPackage(new File([bytes.buffer], "unsafe.zip"))).rejects.toThrow("不支持文件");
  });

  it("rejects a compressed ZIP whose expanded content exceeds 30MB", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", skill);
    zip.file("references/oversized.txt", "x".repeat(31 * 1024 * 1024));
    const bytes = Uint8Array.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));

    expect(bytes.byteLength).toBeLessThan(10 * 1024 * 1024);
    await expect(parseCopilotSkillPackage(new File([bytes.buffer], "oversized.zip"))).rejects.toThrow("解压后不能超过 30MB");
  });

  it("rejects Skill text above 100,000 characters", async () => {
    const oversized = `${skill}\n${"内容".repeat(50_001)}`;
    await expect(parseCopilotSkillPackage(new File([oversized], "large.md"))).rejects.toBeInstanceOf(CopilotSkillPackageError);
  });
});
