import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAiModelConfig: vi.fn(),
  uploadFileToGemini: vi.fn(),
  createFileTextCompletion: vi.fn(),
  readFile: vi.fn()
}));

vi.mock("@/lib/ai/modelClient", () => ({
  resolveAiModelConfig: mocks.resolveAiModelConfig,
  uploadFileToGemini: mocks.uploadFileToGemini,
  createFileTextCompletion: mocks.createFileTextCompletion
}));
vi.mock("fs/promises", () => ({ readFile: mocks.readFile }));

import { ocrPdfWithModel } from "@/lib/document/ocrPdf";

const geminiConfig = { provider: "gemini", apiKey: "k", baseURL: "https://api.im-red-magic.cn", model: "gemini-3.6-flash" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAiModelConfig.mockReturnValue(geminiConfig);
  mocks.readFile.mockResolvedValue(Buffer.from("%PDF-1.7 scanned"));
  mocks.uploadFileToGemini.mockResolvedValue({ uri: "https://x/files/abc", mimeType: "application/pdf" });
  mocks.createFileTextCompletion.mockResolvedValue("识别出的正文文字");
});

describe("ocrPdfWithModel", () => {
  it("uploads the PDF and returns the transcribed text for a gemini endpoint", async () => {
    const text = await ocrPdfWithModel("/tmp/scan.pdf");
    expect(text).toBe("识别出的正文文字");
    expect(mocks.uploadFileToGemini).toHaveBeenCalledTimes(1);
    expect(mocks.uploadFileToGemini.mock.calls[0][1]).toMatchObject({ mimeType: "application/pdf" });
  });

  it("returns null for a non-gemini provider without uploading", async () => {
    mocks.resolveAiModelConfig.mockReturnValue({ ...geminiConfig, provider: "openai-compatible" });
    expect(await ocrPdfWithModel("/tmp/scan.pdf")).toBeNull();
    expect(mocks.uploadFileToGemini).not.toHaveBeenCalled();
  });

  it("returns null when no model is configured", async () => {
    mocks.resolveAiModelConfig.mockReturnValue(null);
    expect(await ocrPdfWithModel("/tmp/scan.pdf")).toBeNull();
    expect(mocks.uploadFileToGemini).not.toHaveBeenCalled();
  });

  it("returns null for a file over the size limit", async () => {
    mocks.readFile.mockResolvedValue(Buffer.alloc(100 * 1024 * 1024 + 1));
    expect(await ocrPdfWithModel("/tmp/huge.pdf")).toBeNull();
    expect(mocks.uploadFileToGemini).not.toHaveBeenCalled();
  });

  it("returns null when the model produces no text", async () => {
    mocks.createFileTextCompletion.mockResolvedValue("   ");
    expect(await ocrPdfWithModel("/tmp/scan.pdf")).toBeNull();
  });
});
