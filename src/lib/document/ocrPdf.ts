import { readFile } from "fs/promises";
import { createFileTextCompletion, resolveAiModelConfig, uploadFileToGemini } from "@/lib/ai/modelClient";

// Scanned PDFs have no text layer, so pdf-parse returns nothing. When the model
// is a vision-capable Gemini endpoint we upload the whole PDF and let the model
// transcribe it. Bounded by size to avoid pushing very large files.
const MAX_OCR_BYTES = 100 * 1024 * 1024;

/**
 * Best-effort visual OCR for a text-layer-less PDF. Returns the transcribed text
 * or null when OCR is unavailable/unsupported (non-gemini provider, oversized
 * file, or an empty model response) so the caller can fall back to a clear error.
 * Every request goes through the configured relay base URL.
 */
export async function ocrPdfWithModel(filePath: string): Promise<string | null> {
  const config = resolveAiModelConfig();
  if (!config || config.provider !== "gemini") return null;

  const bytes = await readFile(filePath);
  if (!bytes.length || bytes.length > MAX_OCR_BYTES) return null;

  const file = await uploadFileToGemini(config, {
    bytes,
    mimeType: "application/pdf",
    displayName: "scanned-pdf-import"
  });

  const text = await createFileTextCompletion({
    model: config.model,
    file,
    system: "你是严谨的文档文字识别助手。",
    user: "这是一份没有文字层的扫描 PDF。请按阅读顺序逐页做视觉文字识别，输出完整的纯文字正文，不要输出解释、标题标注、页码或额外说明。"
  });

  return text && text.trim() ? text : null;
}
