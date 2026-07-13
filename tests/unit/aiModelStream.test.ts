import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGeminiStreamContentUrl,
  createTextCompletionStream
} from "../../src/lib/ai/modelClient";

const envNames = [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_BASE_URL",
  "GEMINI_MODEL",
  "GEMINI_PROVIDER",
  "GOOGLE_API_KEY",
  "GOOGLE_BASE_URL",
  "GOOGLE_MODEL",
  "GOOGLE_PROVIDER",
  "GOOGLE_AI_BASE_URL",
  "GOOGLE_AI_MODEL",
  "GOOGLE_AI_PROVIDER",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "apiKey",
  "key",
  "baseUrl",
  "url",
  "model",
  "modelName",
  "model_name",
  "provider",
  "aiProvider",
  "geminiApiKey",
  "googleApiKey",
  "base_url",
  "apiUrl",
  "api_url",
  "api_key"
] as const;

const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

function clearAiEnv() {
  for (const name of envNames) delete process.env[name];
}

async function collect(stream: AsyncIterable<string>) {
  let output = "";
  for await (const chunk of stream) output += chunk;
  return output;
}

afterEach(() => {
  vi.restoreAllMocks();
  clearAiEnv();
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value !== undefined) process.env[name] = value;
  }
});

describe("AI text streaming", () => {
  it("returns null when no model is configured", async () => {
    clearAiEnv();

    await expect(createTextCompletionStream({
      system: "system",
      messages: [{ role: "user", content: "hello" }]
    })).resolves.toBeNull();
  });

  it("builds the native Gemini SSE endpoint without exposing a second key", () => {
    expect(buildGeminiStreamContentUrl({
      provider: "gemini",
      apiKey: "secret-key",
      baseURL: "https://generativelanguage.googleapis.com/v1beta",
      model: "models/gemini-2.5-flash"
    })).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=secret-key");
  });

  it("parses Gemini SSE frames split across transport chunks and forwards abort", async () => {
    clearAiEnv();
    process.env.GEMINI_API_KEY = "secret-key";
    const signal = new AbortController().signal;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"你"}]}}]}\n'));
        controller.enqueue(encoder.encode('\ndata: {"candidates":[{"content":{"parts":[{"te'));
        controller.enqueue(encoder.encode('xt":"好"}]}}]}\n\n'));
        controller.close();
      }
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" }
    }));

    const stream = await createTextCompletionStream({
      system: "只依据课程资料回答",
      messages: [
        { role: "user", content: "问题一" },
        { role: "assistant", content: "回答一" },
        { role: "user", content: "问题二" }
      ],
      signal
    });

    expect(stream).not.toBeNull();
    await expect(collect(stream!)).resolves.toBe("你好");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(":streamGenerateContent?alt=sse&key=secret-key"),
      expect.objectContaining({ signal })
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.systemInstruction.parts[0].text).toBe("只依据课程资料回答");
    expect(payload.contents).toEqual([
      { role: "user", parts: [{ text: "问题一" }] },
      { role: "model", parts: [{ text: "回答一" }] },
      { role: "user", parts: [{ text: "问题二" }] }
    ]);
  });

  it("rejects malformed Gemini stream frames instead of silently returning a partial answer", async () => {
    clearAiEnv();
    process.env.GEMINI_API_KEY = "secret-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      'data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}\n\ndata: not-json\n\n',
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    ));

    const stream = await createTextCompletionStream({
      system: "system",
      messages: [{ role: "user", content: "hello" }]
    });

    await expect(collect(stream!)).rejects.toThrow("AI stream returned invalid data");
  });

  it("rejects a provider error without returning its body as model text", async () => {
    clearAiEnv();
    process.env.GEMINI_API_KEY = "secret-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      '{"error":{"message":"x-goog-api-key: secret-key"}}',
      { status: 429 }
    ));

    await expect(createTextCompletionStream({
      system: "system",
      messages: [{ role: "user", content: "hello" }]
    })).rejects.toThrow("Gemini API failed: 429");
  });
});
