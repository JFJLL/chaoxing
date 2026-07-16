import OpenAI from "openai";

export type AiProvider = "openai-compatible" | "gemini";

export type AiModelConfig = {
  provider: AiProvider;
  apiKey: string;
  baseURL: string;
  model: string;
};

type CompletionInput = {
  system: string;
  user: string;
  model?: string;
};

type JsonCompletionInput = CompletionInput;

export type TextCompletionMessage = {
  role: "user" | "assistant";
  content: string;
  images?: TextCompletionImage[];
};

export type TextCompletionImage = {
  mimeType: string;
  data: string;
};

export type TextCompletionStreamInput = {
  system: string;
  messages: TextCompletionMessage[];
  model?: string;
  signal?: AbortSignal;
};

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0)?.trim();
}

function normalizeProvider(value: string | undefined, baseURL: string, model?: string): AiProvider {
  const provider = value?.trim().toLowerCase();
  if (provider === "gemini" || provider === "google" || provider === "gemini-native") {
    return "gemini";
  }
  if (provider === "openai" || provider === "openai-compatible") {
    return "openai-compatible";
  }
  if (/generativelanguage|googleapis/i.test(baseURL)) {
    return "gemini";
  }
  if (/^(models\/)?gemini[-/]/i.test(model ?? "")) {
    return "gemini";
  }
  return "openai-compatible";
}

export function resolveAiModelConfig(model?: string): AiModelConfig | null {
  const googleApiKey = firstNonEmpty(
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.geminiApiKey,
    process.env.googleApiKey
  );
  const apiKey = firstNonEmpty(
    process.env.AI_API_KEY,
    googleApiKey,
    process.env.OPENAI_API_KEY,
    process.env.apiKey,
    process.env.key,
    process.env.api_key
  );
  if (!apiKey) return null;

  const explicitProvider = firstNonEmpty(
    process.env.AI_PROVIDER,
    process.env.GEMINI_PROVIDER,
    process.env.GOOGLE_PROVIDER,
    process.env.GOOGLE_AI_PROVIDER,
    process.env.aiProvider,
    process.env.provider
  );
  const providerHint = explicitProvider ?? (googleApiKey ? "gemini" : undefined);
  const hintedProvider = normalizeProvider(providerHint, "");
  const defaultBaseURL = hintedProvider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : "https://api.openai.com/v1";

  const baseURL =
    firstNonEmpty(
      process.env.AI_BASE_URL,
      process.env.GEMINI_BASE_URL,
      process.env.GOOGLE_BASE_URL,
      process.env.GOOGLE_AI_BASE_URL,
      process.env.baseUrl,
      process.env.base_url,
      process.env.apiUrl,
      process.env.api_url,
      process.env.url,
      process.env.OPENAI_BASE_URL,
      defaultBaseURL
    ) ?? defaultBaseURL;
  const inferredProvider = normalizeProvider(providerHint, baseURL);
  const defaultModel = inferredProvider === "gemini" ? "gemini-2.5-flash" : "gpt-4.1-mini";
  const resolvedModel =
    firstNonEmpty(
      model,
      process.env.AI_MODEL,
      process.env.GEMINI_MODEL,
      process.env.GOOGLE_MODEL,
      process.env.GOOGLE_AI_MODEL,
      process.env.model,
      process.env.modelName,
      process.env.model_name,
      process.env.OPENAI_MODEL,
      defaultModel
    ) ?? defaultModel;

  return {
    provider: normalizeProvider(providerHint, baseURL, resolvedModel),
    apiKey,
    baseURL,
    model: resolvedModel
  };
}

function appendApiKey(url: URL, apiKey: string) {
  if (!url.searchParams.has("key")) {
    url.searchParams.set("key", apiKey);
  }
  return url.toString();
}

function normalizeGeminiBaseURL(baseURL: string) {
  const base = baseURL.replace(/\/+$/, "");
  if (base.includes(":generateContent") || /\/models\/[^/]+$/.test(base) || /\/v\d+(?:beta|alpha)?(?:\/|$)/i.test(base)) {
    return base;
  }
  return `${base}/v1beta`;
}

export function buildGeminiGenerateContentUrl(config: AiModelConfig) {
  const base = normalizeGeminiBaseURL(config.baseURL);
  const model = config.model.replace(/^models\//, "");
  const url = base.includes(":generateContent")
    ? new URL(base)
    : /\/models\/[^/]+$/.test(base)
      ? new URL(`${base}:generateContent`)
      : new URL(`${base}/models/${encodeURIComponent(model)}:generateContent`);

  return appendApiKey(url, config.apiKey);
}

export function buildGeminiStreamContentUrl(config: AiModelConfig) {
  const generateUrl = new URL(buildGeminiGenerateContentUrl(config));
  generateUrl.pathname = generateUrl.pathname.replace(/:generateContent$/, ":streamGenerateContent");
  generateUrl.searchParams.set("alt", "sse");
  const apiKey = generateUrl.searchParams.get("key");
  generateUrl.searchParams.delete("key");
  if (apiKey) generateUrl.searchParams.set("key", apiKey);
  return generateUrl.toString();
}

async function createOpenAiCompatibleJsonCompletion(config: AiModelConfig, input: JsonCompletionInput) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: "system",
        content: input.system
      },
      {
        role: "user",
        content: input.user
      }
    ],
    response_format: { type: "json_object" }
  });

  return completion.choices[0]?.message.content || "";
}

async function createOpenAiCompatibleTextCompletion(config: AiModelConfig, input: CompletionInput) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user }
    ]
  });

  return completion.choices[0]?.message.content || "";
}

async function createGeminiJsonCompletion(config: AiModelConfig, input: JsonCompletionInput) {
  const response = await fetch(buildGeminiGenerateContentUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${input.system}\n\n${input.user}`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${message.slice(0, 300)}`);
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

async function createGeminiTextCompletion(config: AiModelConfig, input: CompletionInput) {
  const response = await fetch(buildGeminiGenerateContentUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${input.system}\n\n${input.user}` }]
        }
      ],
      generationConfig: { temperature: 0.2 }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${message.slice(0, 300)}`);
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

export async function createJsonCompletion(input: JsonCompletionInput) {
  const config = resolveAiModelConfig(input.model);
  if (!config) return null;

  if (config.provider === "gemini") {
    return createGeminiJsonCompletion(config, input);
  }

  return createOpenAiCompatibleJsonCompletion(config, input);
}

export async function createTextCompletion(input: CompletionInput) {
  const config = resolveAiModelConfig(input.model);
  if (!config) return null;

  if (config.provider === "gemini") {
    return createGeminiTextCompletion(config, input);
  }

  return createOpenAiCompatibleTextCompletion(config, input);
}

async function* createOpenAiCompatibleTextStream(config: AiModelConfig, input: TextCompletionStreamInput) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: input.system },
    ...input.messages.map((message): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
      if (message.role === "assistant") return { role: "assistant", content: message.content };
      return {
        role: "user",
        content: message.images?.length
          ? [
              { type: "text", text: message.content },
              ...message.images.map((image) => ({
                type: "image_url" as const,
                image_url: { url: `data:${image.mimeType};base64,${image.data}` }
              }))
            ]
          : message.content
      };
    })
  ];
  const completion = await client.chat.completions.create({
    model: config.model,
    stream: true,
    messages
  }, { signal: input.signal });

  for await (const chunk of completion) {
    const text = chunk.choices[0]?.delta.content;
    if (text) yield text;
  }
}

function parseGeminiStreamFrame(frame: string) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") return "";

  try {
    const body = JSON.parse(data) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  } catch {
    throw new Error("AI stream returned invalid data");
  }
}

async function* readGeminiSse(response: Response) {
  if (!response.body) throw new Error("AI stream returned no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const text = parseGeminiStreamFrame(frame);
      if (text) yield text;
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const text = parseGeminiStreamFrame(buffer);
    if (text) yield text;
  }
}

async function createGeminiTextStream(config: AiModelConfig, input: TextCompletionStreamInput) {
  const response = await fetch(buildGeminiStreamContentUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: input.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [
          { text: message.content },
          ...(message.images ?? []).map((image) => ({
            inlineData: { mimeType: image.mimeType, data: image.data }
          }))
        ]
      })),
      generationConfig: { temperature: 0.2 }
    }),
    signal: input.signal
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${message.slice(0, 300)}`);
  }

  return readGeminiSse(response);
}

export async function createTextCompletionStream(input: TextCompletionStreamInput): Promise<AsyncIterable<string> | null> {
  const config = resolveAiModelConfig(input.model);
  if (!config) return null;

  if (config.provider === "gemini") {
    return createGeminiTextStream(config, input);
  }

  return createOpenAiCompatibleTextStream(config, input);
}
