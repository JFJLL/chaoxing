import { describe, expect, it, vi } from "vitest";
import {
  encodeAiStreamEvent,
  readAiStream,
  type AiStreamEvent
} from "../../src/lib/ai/streamProtocol";

function streamResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  }), {
    status,
    headers: { "Content-Type": "application/x-ndjson" }
  });
}

describe("AI NDJSON stream protocol", () => {
  it("encodes one validated event per line", () => {
    expect(encodeAiStreamEvent({ type: "delta", text: "你好" })).toBe('{"type":"delta","text":"你好"}\n');
  });

  it("parses events split across transport chunks", async () => {
    const events: AiStreamEvent[] = [];
    const onEvent = vi.fn((event: AiStreamEvent) => events.push(event));
    const response = streamResponse([
      '{"type":"meta","conversationId":"conversation-1","userMessageId":"message-1","citations":[]}',
      '\n{"type":"del',
      'ta","text":"你"}\n{"type":"delta","text":"好"}\n',
      '{"type":"done","assistantMessage":{"id":"message-2","role":"assistant","content":"你好","citations":[],"createdAt":"2026-07-13T00:00:00.000Z"}}\n'
    ]);

    await readAiStream(response, onEvent);

    expect(events.map((event) => event.type)).toEqual(["meta", "delta", "delta", "done"]);
  });

  it("rejects unknown or malformed events", async () => {
    await expect(readAiStream(
      streamResponse(['{"type":"template","content":"fallback"}\n']),
      vi.fn()
    )).rejects.toMatchObject({ code: "AI_STREAM_INVALID" });
  });

  it("rejects a truncated final event instead of accepting a partial answer", async () => {
    await expect(readAiStream(
      streamResponse(['{"type":"delta","text":"partial"']),
      vi.fn()
    )).rejects.toMatchObject({ code: "AI_STREAM_INVALID" });
  });

  it("uses the safe JSON error for a non-stream response", async () => {
    const response = new Response(JSON.stringify({ code: "MODEL_RATE_LIMITED", error: "AI 服务繁忙，请稍后重试" }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    });

    await expect(readAiStream(response, vi.fn())).rejects.toMatchObject({
      code: "MODEL_RATE_LIMITED",
      message: "AI 服务繁忙，请稍后重试"
    });
  });
});
