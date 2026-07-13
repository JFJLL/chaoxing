import { z } from "zod";

export const aiCitationSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.string().min(1).max(40),
  label: z.string().min(1).max(240),
  snippet: z.string().min(1).max(2_000),
  href: z.string().startsWith("/").max(1_000)
}).strict();

const assistantMessageSchema = z.object({
  id: z.string().min(1).max(160),
  role: z.literal("assistant"),
  content: z.string().min(1).max(100_000),
  citations: z.array(aiCitationSchema).max(12),
  createdAt: z.string().datetime()
}).strict();

export const aiStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("meta"),
    conversationId: z.string().min(1).max(160),
    userMessageId: z.string().min(1).max(160),
    citations: z.array(aiCitationSchema).max(12)
  }).strict(),
  z.object({
    type: z.literal("delta"),
    text: z.string().min(1).max(32_000)
  }).strict(),
  z.object({
    type: z.literal("done"),
    assistantMessage: assistantMessageSchema
  }).strict(),
  z.object({
    type: z.literal("error"),
    code: z.string().min(1).max(80),
    error: z.string().min(1).max(240)
  }).strict()
]);

export type AiCitation = z.infer<typeof aiCitationSchema>;
export type AiStreamEvent = z.infer<typeof aiStreamEventSchema>;

export class AiStreamClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AiStreamClientError";
  }
}

export function encodeAiStreamEvent(event: AiStreamEvent) {
  return `${JSON.stringify(aiStreamEventSchema.parse(event))}\n`;
}

async function errorFromResponse(response: Response) {
  try {
    const body = await response.json() as { code?: unknown; error?: unknown };
    const code = typeof body.code === "string" && body.code.length <= 80 ? body.code : "AI_REQUEST_FAILED";
    const message = typeof body.error === "string" && body.error.length <= 240
      ? body.error
      : "AI 调用失败，请重试";
    return new AiStreamClientError(code, message, response.status);
  } catch {
    return new AiStreamClientError("AI_REQUEST_FAILED", "AI 调用失败，请重试", response.status);
  }
}

export async function readAiStream(response: Response, onEvent: (event: AiStreamEvent) => void) {
  if (!response.ok) throw await errorFromResponse(response);
  if (!response.body) throw new AiStreamClientError("AI_STREAM_INVALID", "AI 返回内容不完整，请重试");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let event: AiStreamEvent;
      try {
        event = aiStreamEventSchema.parse(JSON.parse(line));
      } catch {
        throw new AiStreamClientError("AI_STREAM_INVALID", "AI 返回内容无效，请重试");
      }
      if (terminal) throw new AiStreamClientError("AI_STREAM_INVALID", "AI 返回内容无效，请重试");
      onEvent(event);
      terminal = event.type === "done" || event.type === "error";
    }
    if (done) break;
  }

  if (buffer.trim() || !terminal) {
    throw new AiStreamClientError("AI_STREAM_INVALID", "AI 返回内容不完整，请重试");
  }
}
