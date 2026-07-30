import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadFileToGemini } from "../../src/lib/ai/modelClient";
import type { AiModelConfig } from "../../src/lib/ai/modelClient";

const geminiConfig: AiModelConfig = {
  provider: "gemini",
  apiKey: "test-key",
  baseURL: "https://api.im-red-magic.cn",
  model: "gemini-3.6-flash"
};

function startResponse(uploadUrl: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === "x-goog-upload-url" ? uploadUrl : null) },
    json: async () => ({}),
    text: async () => ""
  } as unknown as Response;
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  } as unknown as Response;
}

afterEach(() => vi.restoreAllMocks());

describe("uploadFileToGemini", () => {
  it("routes the resumable upload back through the relay host and returns the file uri", async () => {
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url.includes("/upload/v1beta/files") && calls.length === 1) {
        // Google hands back its raw host for the resumable upload URL.
        return Promise.resolve(startResponse("https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=XYZ&upload_protocol=resumable"));
      }
      return Promise.resolve(jsonResponse({ file: { uri: "https://generativelanguage.googleapis.com/v1beta/files/abc", name: "files/abc", state: "ACTIVE" } }));
    });

    const result = await uploadFileToGemini(geminiConfig, { bytes: Buffer.from("%PDF-1.7 fake"), mimeType: "application/pdf" });

    expect(result).toEqual({ uri: "https://generativelanguage.googleapis.com/v1beta/files/abc", mimeType: "application/pdf" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The second (bytes) request must go to the relay host, never Google directly, and carry the key.
    const uploadCall = calls[1]!;
    expect(uploadCall).toContain("https://api.im-red-magic.cn/upload/v1beta/files");
    expect(uploadCall).not.toContain("generativelanguage.googleapis.com");
    expect(uploadCall).toContain("upload_id=XYZ");
    expect(uploadCall).toContain("key=test-key");
  });

  it("rejects non-gemini providers instead of hard-coding a Google host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      uploadFileToGemini({ ...geminiConfig, provider: "openai-compatible" }, { bytes: Buffer.from("x"), mimeType: "application/pdf" })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
