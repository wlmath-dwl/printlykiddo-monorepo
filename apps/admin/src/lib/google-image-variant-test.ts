type GoogleImageVariantResult = {
  mimeType: string;
  base64Data: string;
};

type GoogleImageVariantInput = {
  buffer: Buffer;
  mimeType: string;
};

export type GoogleImageVariantKind = "scene_color" | "outline";
type GoogleImageVariantProgressCallback = (message: string) => void;

/** 全站图片生成（Generative Language API）统一使用的模型 id */
export const GOOGLE_IMAGE_GENERATION_MODEL = "gemini-2.0-flash";
const GOOGLE_FETCH_MAX_ATTEMPTS = 3;
const GOOGLE_REQUEST_THROTTLE_MS = 4000;
const GOOGLE_FETCH_RETRY_BASE_MS = 5000;
const GOOGLE_FETCH_RETRY_429_EXTRA_MS = 12000;
const GOOGLE_FETCH_RETRY_5XX_EXTRA_MS = 5000;
const GOOGLE_FETCH_RETRY_NETWORK_EXTRA_MS = 4000;
const GOOGLE_GLOBAL_429_COOLDOWN_MS = 25000;
const GOOGLE_GLOBAL_5XX_COOLDOWN_MS = 12000;
const GOOGLE_GLOBAL_NETWORK_COOLDOWN_MS = 10000;

let googleRequestQueue: Promise<void> = Promise.resolve();
let googleNextRequestAt = 0;
let googleGlobalCooldownUntil = 0;

function buildGoogleApiEndpoint() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_IMAGE_GENERATION_MODEL}:generateContent`;
}

function getGoogleApiKey() {
  const apiKey =
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENAI_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    throw new Error(
      "未配置 Google 图片生成 API Key，请设置 GOOGLE_API_KEY、GEMINI_API_KEY 或 GOOGLE_GENAI_API_KEY。",
    );
  }

  return apiKey;
}

function buildApiErrorMessage(status: number, payload: unknown) {
  const statusLabel =
    status === 408
      ? "请求超时"
      : status === 429
        ? "触发限流"
        : status >= 500
          ? "Google 服务端错误"
          : status >= 400
            ? "请求被拒绝"
            : "未知错误";

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return `Google 图片变体生成失败（HTTP ${status}，${statusLabel}）：${payload.error.message}`;
  }

  return `Google 图片变体生成失败（HTTP ${status}，${statusLabel}）。`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function getRetryDelayMs(status: number, attempt: number) {
  const baseDelay = GOOGLE_FETCH_RETRY_BASE_MS * attempt;
  if (status === 429) {
    return baseDelay + GOOGLE_FETCH_RETRY_429_EXTRA_MS * attempt;
  }
  if (status >= 500) {
    return baseDelay + GOOGLE_FETCH_RETRY_5XX_EXTRA_MS * attempt;
  }
  return baseDelay;
}

function getNetworkRetryDelayMs(attempt: number) {
  return GOOGLE_FETCH_RETRY_BASE_MS * attempt + GOOGLE_FETCH_RETRY_NETWORK_EXTRA_MS * attempt;
}

function parseRetryAfterMs(retryAfterHeader: string | null) {
  if (!retryAfterHeader) {
    return null;
  }

  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.round(seconds * 1000);
  }

  const retryAtMs = Date.parse(retryAfterHeader);
  if (Number.isNaN(retryAtMs)) {
    return null;
  }

  return Math.max(0, retryAtMs - Date.now());
}

function applyGoogleGlobalCooldown(ms: number) {
  googleGlobalCooldownUntil = Math.max(googleGlobalCooldownUntil, Date.now() + ms);
}

async function waitForGoogleRequestSlot(options?: {
  targetLabel?: string;
  onProgress?: GoogleImageVariantProgressCallback;
}) {
  const run = async () => {
    const waitMs = Math.max(0, Math.max(googleNextRequestAt, googleGlobalCooldownUntil) - Date.now());
    if (waitMs > 0) {
      options?.onProgress?.(
        `${options?.targetLabel || "图片"}请求节流等待中，约 ${Math.ceil(waitMs / 1000)} 秒后发送…`,
      );
      await sleep(waitMs);
    }
    googleNextRequestAt = Date.now() + GOOGLE_REQUEST_THROTTLE_MS;
  };

  const scheduled = googleRequestQueue.then(run, run);
  googleRequestQueue = scheduled.catch(() => undefined);
  await scheduled;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getVariantLabel(targetKind: GoogleImageVariantKind) {
  return targetKind === "scene_color" ? "带背景彩图" : "线框图";
}

function getFirstInlineImage(payload: unknown): GoogleImageVariantResult | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("candidates" in payload) ||
    !Array.isArray(payload.candidates)
  ) {
    return null;
  }

  for (const candidate of payload.candidates) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !("content" in candidate) ||
      !candidate.content ||
      typeof candidate.content !== "object" ||
      !("parts" in candidate.content) ||
      !Array.isArray(candidate.content.parts)
    ) {
      continue;
    }

    for (const part of candidate.content.parts) {
      if (
        part &&
        typeof part === "object" &&
        "inlineData" in part &&
        part.inlineData &&
        typeof part.inlineData === "object" &&
        "data" in part.inlineData &&
        typeof part.inlineData.data === "string"
      ) {
        return {
          mimeType:
            "mimeType" in part.inlineData && typeof part.inlineData.mimeType === "string"
              ? part.inlineData.mimeType
              : "image/png",
          base64Data: part.inlineData.data,
        };
      }
    }
  }

  return null;
}

export function buildSceneColorVariantPrompt() {
  return `Use the provided image as the locked subject-and-style reference. Generate one children's printable full-background colored image by extending that exact artwork into a simple scene.

Subject and style lock:
- Keep the same single main subject identity, same pose, same view direction, same silhouette logic, same facial design, same proportions, and same composition center as the uploaded image.
- Keep the same outline behavior, same flat-color illustration treatment, same simplification level, and same child-friendly cartoon style as the uploaded image.
- Treat the uploaded colored image as the final style source of truth.
- Do not redesign, reinterpret, restyle, beautify, or upgrade the subject.

What to change:
- Only expand the image into a complete full-background colored scene that supports the existing subject.
- The new background should feel like a natural extension of the uploaded artwork, not a new illustration concept.
- The background must stay simple, low-detail, child-friendly, and clearly secondary to the subject.

What must not change:
- Do not change the subject's design, palette logic, line style, shape language, pose, expression, or overall visual identity.
- Do not turn it into realistic, semi-realistic, painterly, airbrushed, shaded, glossy, textured, 3D, or cinematic artwork.
- Do not add extra characters, extra animals, extra objects that become a second focal point, or any dense narrative scene.

Visual rules:
1. Keep only one main subject.
2. The subject must remain the dominant focal point.
3. Use clear, closed, crisp black outlines.
4. Use bright, clean, flat color fills.
5. Avoid shadows by default. No gradients, no heavy shading, no cast shadows, no contact shadows, no shadow under the subject, no edge darkening, no texture, no realistic lighting, no glow, and no ambient occlusion.
6. Only in rare cases where recognition would otherwise suffer may you use an extremely light, minimal, flat two-tone value separation, and it must still read as flat children's illustration rather than rendered lighting.
7. Keep the line count and shape complexity low.
8. Preserve strong print readability for children.
9. The final output must be a strict 1:1 square image.
10. Do not add text, watermark, border, puzzle guides, crop guides, panel dividers, or production/helper lines.

Composition rules:
- If the uploaded image is already centered and balanced, preserve that framing as much as possible.
- The subject should generally stay around the central area and remain visually prominent.
- The background should fill the canvas to the edges without overpowering the subject.
- Avoid large blank white areas, but also avoid busy backgrounds.

Output goal:
Create one result that looks like the uploaded colored subject artwork itself has been carefully extended into a clean, print-friendly, full-background children's scene, with the subject still clearly primary.`;
}

export function buildOutlineVariantPrompt() {
  return `Use the provided colored image as the locked reference and convert it into one children's printable black-and-white outline image.

Conversion lock:
- Keep the same single subject identity, same pose, same view direction, same silhouette, same composition center, and same key shape relationships as the uploaded image.
- This should feel like a direct outline conversion of the uploaded artwork, not a re-illustration.
- Do not redesign, reinterpret, restyle, embellish, or invent new visual elements.

What to change:
- Convert the uploaded colored subject into a pure black-and-white line-art version.
- Preserve only the lines needed for recognition, major shape separation, and a small number of essential interior structure details.

What must not change:
- Do not change the pose, proportions, facial design, silhouette logic, or subject identity.
- Do not add new props, new background elements, new decorative elements, or extra scene content.
- Do not introduce color, grayscale fill, gradients, shading, highlights, texture, lighting effects, or sketchy rendering.

Outline rules:
1. Keep only one subject.
2. Output a pure black-and-white outline image directly.
3. Use only clear, closed, smooth black contours and a very small number of necessary structure lines.
4. Keep the interior line count strictly controlled.
5. Reduce non-essential detail while preserving recognizability.
6. The result must be easy to use for coloring, tracing, and printable activities for ages 3-8.
7. The background must be pure white.
8. The final output must be a strict 1:1 square image.
9. Do not include text, watermark, border, puzzle guides, crop guides, panel dividers, or production/helper lines.

Output goal:
Create one clean black-line printable result that looks like the uploaded colored artwork has been directly converted into a crisp outline version, with no fill and no extra invented content.`;
}

export function buildCutOutlineImagePrompt() {
  return `Use the provided image as the locked reference and generate one printable cut-outline version of that exact image.

This instruction is generic and must work for any single-subject image type:
- animal
- person
- object
- toy
- vehicle
- food
- plant
- cartoon character
- any other single clear subject

Reference lock:
- Keep the same main subject identity, same pose, same view direction, same proportions, same silhouette logic, and same composition center as the uploaded image.
- Keep the subject artwork itself visually unchanged as much as possible.
- Do not redesign, reinterpret, restyle, beautify, or redraw the subject into a different visual language.
- Treat the uploaded image as the final visual source of truth.

What to produce:
- Keep the original colored subject on a pure white background.
- Add exactly one largest outer contour only around the whole subject.
- The contour must sit outside the subject with a clear and visually even gap.
- The contour must be dashed, not solid.
- The contour must be smooth, rounded, simple, and print-friendly.
- If the subject silhouette has tiny bumps, tiny gaps, tiny concavities, tiny overlaps, or other small local differences, smooth them out.
- Prefer a calm geometric envelope over noisy micro-detail.

Contour rules:
1. There must be only one outer contour.
2. Use only the largest outer contour around the full subject.
3. Do not create interior contours.
4. Do not create multiple loops, nested loops, detached contour fragments, helper marks, or broken contour pieces.
5. Do not trace between legs, under arms, inside tails, or inside narrow shape gaps if that would create secondary contour regions.
6. Ignore small local silhouette irregularities and smooth them away.
7. The dashed contour should feel even and consistent around the subject.

Hard constraints:
1. Pure white background only.
2. Exactly one main subject only.
3. No floor line, no ground shadow, no cast shadow, no shadow base.
4. No text, watermark, border, crop marks, registration marks, alignment marks, or guide lines.
5. No extra decorations, no scene elements, no texture overlays.
6. The final output must stay a strict 1:1 square image.

Output goal:
Return one clean printable image that preserves the uploaded subject and adds one smooth dashed outer contour only, using the largest outer envelope and smoothing away small differences.`;
}

async function requestGoogleImageVariant(
  image: GoogleImageVariantInput,
  prompt: string,
  options?: {
    targetKind?: GoogleImageVariantKind;
    onProgress?: GoogleImageVariantProgressCallback;
  },
): Promise<GoogleImageVariantResult> {
  const base64Image = image.buffer.toString("base64");
  let lastError: Error | null = null;
  const targetLabel = options?.targetKind ? getVariantLabel(options.targetKind) : "图片";

  for (let attempt = 1; attempt <= GOOGLE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      await waitForGoogleRequestSlot({
        targetLabel,
        onProgress: options?.onProgress,
      });
      options?.onProgress?.(
        attempt === 1
          ? `正在请求${targetLabel}…`
          : `${targetLabel}第 ${attempt} 次请求中…`,
      );
      const response = await fetch(buildGoogleApiEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": getGoogleApiKey(),
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: image.mimeType || "image/png",
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K",
            },
          },
        }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const error = new Error(buildApiErrorMessage(response.status, payload));
        if (attempt < GOOGLE_FETCH_MAX_ATTEMPTS && isRetryableStatus(response.status)) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
          const retryDelayMs = Math.max(getRetryDelayMs(response.status, attempt), retryAfterMs ?? 0);
          if (response.status === 429) {
            applyGoogleGlobalCooldown(
              Math.max(retryDelayMs, retryAfterMs ?? 0, GOOGLE_GLOBAL_429_COOLDOWN_MS * attempt),
            );
          } else if (response.status >= 500) {
            applyGoogleGlobalCooldown(Math.max(retryDelayMs, GOOGLE_GLOBAL_5XX_COOLDOWN_MS * attempt));
          }
          lastError = error;
          options?.onProgress?.(
            `${targetLabel}请求失败，${Math.ceil(retryDelayMs / 1000)} 秒后重试（第 ${attempt + 1} 次）：${error.message}`,
          );
          await sleep(retryDelayMs);
          continue;
        }
        throw error;
      }

      options?.onProgress?.(`已收到${targetLabel}结果，正在解析…`);
      const imageResult = getFirstInlineImage(payload);
      if (!imageResult) {
        throw new Error("Google API 未返回图片结果。");
      }

      return imageResult;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(getErrorMessage(error, "Google 图片变体生成失败。"));
      const looksLikeNetworkError =
        normalizedError.message.includes("fetch failed") || normalizedError.message.includes("network");

      if (attempt < GOOGLE_FETCH_MAX_ATTEMPTS && looksLikeNetworkError) {
        const retryDelayMs = getNetworkRetryDelayMs(attempt);
        applyGoogleGlobalCooldown(Math.max(retryDelayMs, GOOGLE_GLOBAL_NETWORK_COOLDOWN_MS * attempt));
        lastError = normalizedError;
        options?.onProgress?.(
          `${targetLabel}网络请求失败，${Math.ceil(retryDelayMs / 1000)} 秒后重试（第 ${attempt + 1} 次）：${normalizedError.message}`,
        );
        await sleep(retryDelayMs);
        continue;
      }

      throw normalizedError;
    }
  }

  throw lastError ?? new Error("Google 图片变体生成失败。");
}

export async function generateTestImageVariantsSettledFromBuffer(
  inputImage: GoogleImageVariantInput,
  targetKinds: GoogleImageVariantKind[] = ["scene_color", "outline"],
  options?: {
    onProgress?: (payload: { targetKind: GoogleImageVariantKind; message: string }) => void;
  },
) {
  const requestedKinds = Array.from(new Set(targetKinds));
  const settled = await Promise.allSettled(
    requestedKinds.map(async (targetKind) => ({
      targetKind,
      result: await requestGoogleImageVariant(
        inputImage,
        targetKind === "scene_color" ? buildSceneColorVariantPrompt() : buildOutlineVariantPrompt(),
        {
          targetKind,
          onProgress: (message) => options?.onProgress?.({ targetKind, message }),
        },
      ),
    })),
  );

  const results: Partial<Record<GoogleImageVariantKind, GoogleImageVariantResult>> = {};
  const errors: Partial<Record<GoogleImageVariantKind, string>> = {};

  settled.forEach((entry, index) => {
    const targetKind = requestedKinds[index];
    if (entry.status === "fulfilled") {
      results[targetKind] = entry.value.result;
      return;
    }

    errors[targetKind] = getErrorMessage(entry.reason, "Google 图片变体生成失败。");
  });

  return { results, errors };
}

export async function generateTestImageVariants(inputImage: File) {
  const imageBuffer = Buffer.from(await inputImage.arrayBuffer());
  return generateTestImageVariantsFromBuffer({
    buffer: imageBuffer,
    mimeType: inputImage.type || "image/png",
  });
}

export async function generateTestImageVariantsFromBuffer(inputImage: GoogleImageVariantInput) {
  const settled = await generateTestImageVariantsSettledFromBuffer(inputImage, ["scene_color", "outline"]);
  if (!settled.results.scene_color || !settled.results.outline) {
    throw new Error(
      settled.errors.scene_color || settled.errors.outline || "Google 图片变体生成失败，未得到完整结果。",
    );
  }

  return {
    scene_color: settled.results.scene_color,
    outline: settled.results.outline,
  };
}

export async function generateCutOutlineImageFromBuffer(
  inputImage: GoogleImageVariantInput,
  options?: {
    onProgress?: GoogleImageVariantProgressCallback;
  },
) {
  return requestGoogleImageVariant(inputImage, buildCutOutlineImagePrompt(), {
    onProgress: options?.onProgress,
  });
}

export async function generateImageFromTextPrompt(
  prompt: string,
  options?: {
    onProgress?: GoogleImageVariantProgressCallback;
  },
): Promise<GoogleImageVariantResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= GOOGLE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      await waitForGoogleRequestSlot({
        targetLabel: "彩图",
        onProgress: options?.onProgress,
      });
      options?.onProgress?.(
        attempt === 1 ? "正在请求生成彩图…" : `彩图第 ${attempt} 次请求中…`,
      );
      const response = await fetch(buildGoogleApiEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": getGoogleApiKey(),
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K",
            },
          },
        }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const error = new Error(buildApiErrorMessage(response.status, payload));
        if (attempt < GOOGLE_FETCH_MAX_ATTEMPTS && isRetryableStatus(response.status)) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
          const retryDelayMs = Math.max(getRetryDelayMs(response.status, attempt), retryAfterMs ?? 0);
          if (response.status === 429) {
            applyGoogleGlobalCooldown(Math.max(retryDelayMs, retryAfterMs ?? 0, GOOGLE_GLOBAL_429_COOLDOWN_MS * attempt));
          } else if (response.status >= 500) {
            applyGoogleGlobalCooldown(Math.max(retryDelayMs, GOOGLE_GLOBAL_5XX_COOLDOWN_MS * attempt));
          }
          lastError = error;
          options?.onProgress?.(`彩图请求失败，${Math.ceil(retryDelayMs / 1000)} 秒后重试（第 ${attempt + 1} 次）：${error.message}`);
          await sleep(retryDelayMs);
          continue;
        }
        throw error;
      }

      options?.onProgress?.("已收到彩图结果，正在解析…");
      const imageResult = getFirstInlineImage(payload);
      if (!imageResult) {
        throw new Error("Google API 未返回图片结果。");
      }
      return imageResult;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(getErrorMessage(error, "彩图生成失败。"));
      const looksLikeNetworkError = normalizedError.message.includes("fetch failed") || normalizedError.message.includes("network");
      if (attempt < GOOGLE_FETCH_MAX_ATTEMPTS && looksLikeNetworkError) {
        const retryDelayMs = getNetworkRetryDelayMs(attempt);
        applyGoogleGlobalCooldown(Math.max(retryDelayMs, GOOGLE_GLOBAL_NETWORK_COOLDOWN_MS * attempt));
        lastError = normalizedError;
        options?.onProgress?.(`彩图网络请求失败，${Math.ceil(retryDelayMs / 1000)} 秒后重试：${normalizedError.message}`);
        await sleep(retryDelayMs);
        continue;
      }
      throw normalizedError;
    }
  }
  throw lastError ?? new Error("彩图生成失败。");
}
