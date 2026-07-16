import { extname, basename } from "path";
import JSZip from "jszip";

export const COPILOT_MAX_SKILL_UPLOAD_BYTES = 10 * 1024 * 1024;
export const COPILOT_MAX_SKILL_TEXT_CHARACTERS = 100_000;
const MAX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
const MAX_ZIP_FILES = 100;
const referenceExtensions = new Set([".md", ".txt", ".json", ".csv"]);

export class CopilotSkillPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotSkillPackageError";
  }
}

function parseFrontmatter(markdown: string) {
  const match = markdown.replace(/^\uFEFF/, "").match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) throw new CopilotSkillPackageError("SKILL.md 必须包含 name 和 description 元数据");
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.+?)\s*$/);
    if (field) fields.set(field[1].toLowerCase(), field[2].replace(/^['"]|['"]$/g, ""));
  }
  const name = fields.get("name")?.trim();
  const description = fields.get("description")?.trim();
  if (!name || !description) throw new CopilotSkillPackageError("SKILL.md 必须填写 name 和 description");
  if (name.length > 120 || description.length > 500) throw new CopilotSkillPackageError("Skill 名称或说明过长");
  return { name, description };
}

function validateTextLength(text: string) {
  if (text.length > COPILOT_MAX_SKILL_TEXT_CHARACTERS) {
    throw new CopilotSkillPackageError("Skill 可用文本不能超过 100,000 字符");
  }
}

async function parseZip(bytes: Buffer) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  } catch {
    throw new CopilotSkillPackageError("ZIP 文件损坏或格式无效");
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX/"));
  if (entries.length === 0 || entries.length > MAX_ZIP_FILES) throw new CopilotSkillPackageError("ZIP 最多包含 100 个文件");
  const rootSkill = entries.find((entry) => entry.name.toLowerCase() === "skill.md");
  if (!rootSkill) throw new CopilotSkillPackageError("ZIP 根目录必须包含 SKILL.md");

  let uncompressed = 0;
  for (const entry of entries) {
    if (entry.name.includes("..") || entry.name.startsWith("/") || entry.name.includes("\\")) {
      throw new CopilotSkillPackageError("ZIP 包含不安全的文件路径");
    }
    const internal = entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };
    uncompressed += internal._data?.uncompressedSize ?? 0;
    if (uncompressed > MAX_UNCOMPRESSED_BYTES) throw new CopilotSkillPackageError("ZIP 解压后不能超过 30MB");
    if (!referenceExtensions.has(extname(entry.name).toLowerCase())) {
      throw new CopilotSkillPackageError(`Skill 包不支持文件：${entry.name}`);
    }
  }

  const skillText = await rootSkill.async("string");
  const references: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry === rootSkill) continue;
    const text = await entry.async("string");
    references.push(`\n\n---\n参考文件：${entry.name}\n\n${text}`);
  }
  const instructions = `${skillText}${references.join("")}`;
  validateTextLength(instructions);
  return { ...parseFrontmatter(skillText), instructions };
}

export async function parseCopilotSkillPackage(file: File) {
  if (file.size < 1 || file.size > COPILOT_MAX_SKILL_UPLOAD_BYTES) {
    throw new CopilotSkillPackageError("Skill 文件不能超过 10MB");
  }
  const extension = extname(file.name).toLowerCase();
  if (extension !== ".md" && extension !== ".zip") {
    throw new CopilotSkillPackageError("仅支持 Markdown 或 ZIP Skill");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (extension === ".zip") return { ...(await parseZip(bytes)), originalName: basename(file.name), fileSize: file.size };
  const instructions = bytes.toString("utf8");
  validateTextLength(instructions);
  return { ...parseFrontmatter(instructions), instructions, originalName: basename(file.name), fileSize: file.size };
}
