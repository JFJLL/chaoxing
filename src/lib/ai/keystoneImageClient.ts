import { AiServiceError } from "@/lib/ai/errors";

type KeystoneImageResponse = {
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { message?: string; code?: string };
};

function getConfig() {
  const endpoint = process.env.KEYSTONE_IMAGE_GENERATION_URL?.trim() ?? "";
  const apiKey = process.env.KEYSTONE_IMAGE_API_KEY?.trim() ?? "";
  return {
    endpoint,
    apiKey,
    model: process.env.KEYSTONE_IMAGE_MODEL?.trim() || "gpt-image-2",
    aspectRatio: process.env.KEYSTONE_IMAGE_ASPECT_RATIO?.trim() || "16:9",
    resolution: process.env.KEYSTONE_IMAGE_RESOLUTION?.trim() || "1k",
    quality: process.env.KEYSTONE_IMAGE_QUALITY?.trim() || "medium"
  };
}

function asBuffer(value: string) {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new AiServiceError("IMAGE_PROVIDER_INVALID_RESPONSE", "图像服务返回的图片数据无效");
  }
}

export type GeneratedImage = { bytes: Buffer; revisedPrompt?: string; providerAssetUrl?: string };

export async function generateKeystoneSlideImage(prompt: string): Promise<GeneratedImage> {
  const config = getConfig();
  if (!config.endpoint || !config.apiKey) {
    throw new AiServiceError("IMAGE_PROVIDER_NOT_CONFIGURED", "GPT Image 2 尚未配置，请联系管理员完成图像服务配置");
  }

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        n: 1,
        aspect_ratio: config.aspectRatio,
        resolution: config.resolution,
        quality: config.quality,
        response_format: "b64_json"
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000)
    });
  } catch {
    throw new AiServiceError("IMAGE_PROVIDER_NETWORK_ERROR", "图像服务暂时不可用，请稍后重试");
  }

  const raw = await response.text();
  let body: KeystoneImageResponse | null = null;
  try {
    body = JSON.parse(raw) as KeystoneImageResponse;
  } catch {
    // Provider error body may be non-JSON; hide it because it can include operational details.
  }
  if (!response.ok) {
    throw new AiServiceError("IMAGE_PROVIDER_REQUEST_FAILED", body?.error?.message?.slice(0, 240) || "图像服务生成失败，请稍后重试");
  }

  const image = body?.data?.[0];
  if (!image) throw new AiServiceError("IMAGE_PROVIDER_INVALID_RESPONSE", "图像服务未返回图片");
  if (image.b64_json) return { bytes: asBuffer(image.b64_json), revisedPrompt: image.revised_prompt };
  if (image.url) {
    const assetResponse = await fetch(image.url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!assetResponse.ok) throw new AiServiceError("IMAGE_PROVIDER_INVALID_RESPONSE", "图像服务图片下载失败");
    return { bytes: Buffer.from(await assetResponse.arrayBuffer()), revisedPrompt: image.revised_prompt, providerAssetUrl: image.url };
  }
  throw new AiServiceError("IMAGE_PROVIDER_INVALID_RESPONSE", "图像服务返回格式不受支持");
}
