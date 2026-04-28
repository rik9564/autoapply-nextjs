import Groq from "groq-sdk";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletion } from "groq-sdk/resources/chat/completions";

// ─── Model constants ───────────────────────────────────────────────────────────
// Best free-tier TPM for bulk extraction (30K TPM, 500K TPD)
export const EXTRACTION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
// Best quality for per-job reasoning (8K TPM, 200K TPD)
export const ANALYSIS_MODEL = "openai/gpt-oss-120b";

// ─── Singleton client ──────────────────────────────────────────────────────────
let _client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "your_groq_api_key_here") {
      throw new Error("GROQ_API_KEY is not set. Add it to .env.local");
    }
    _client = new Groq({ apiKey });
  }
  return _client;
}

// ─── Retry wrapper ─────────────────────────────────────────────────────────────
const RETRY_STATUS_CODES = [429, 500, 502, 503, 504];
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 3000;

export async function groqChatWithRetry(
  params: ChatCompletionCreateParamsNonStreaming,
  attempt = 0
): Promise<ChatCompletion> {
  const client = getGroqClient();

  try {
    return await client.chat.completions.create(params);
  } catch (err: unknown) {
    const error = err as { status?: number; headers?: Record<string, string>; message?: string };
    const status = error?.status ?? 0;

    if (RETRY_STATUS_CODES.includes(status) && attempt < MAX_RETRIES) {
      // Respect retry-after header if present
      const retryAfterSec = error?.headers?.["retry-after"]
        ? parseInt(error.headers["retry-after"]) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt);

      const waitMs = Math.min(retryAfterSec, 60_000);
      console.warn(`  Groq ${status} — retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms`);
      await sleep(waitMs);
      return groqChatWithRetry(params, attempt + 1);
    }

    throw err;
  }
}

// ─── Batch helper ──────────────────────────────────────────────────────────────
const BATCH_DELAY_MS = 3000;

/**
 * Process an array of items in batches, calling `fn` for each batch,
 * with a 3s inter-batch delay to stay under TPM limits.
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (batch: T[], batchIndex: number, totalBatches: number) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batchIndex = i / batchSize;
    const batch = items.slice(i, i + batchSize);
    const batchResults = await fn(batch, batchIndex, totalBatches);
    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function parseGroqJSON<T>(content: string): T | null {
  // Strip markdown code fences if present
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract the first JSON object/array
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const match = objMatch && arrMatch
      ? (cleaned.indexOf("{") < cleaned.indexOf("[") ? objMatch : arrMatch)
      : (objMatch ?? arrMatch);
    if (match) {
      try { return JSON.parse(match[0]) as T; } catch { /* fall through */ }
    }
    return null;
  }
}
