import { supabase } from './supabase';
import { getSettingNumber, getSetting, updateSetting } from './settings';
import crypto from 'crypto';

// Ollama endpoint - override via OLLAMA_URL env var for remote VMs
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// Available Gemma 4 models via Ollama
// Context windows: 31b/26b = 256K tokens, others = 128K tokens
export const AVAILABLE_MODELS = {
  'gemma4:31b': {
    name: 'Gemma 4 31B',
    type: 'both' as const,
    thinking: false,
    contextWindow: 262144, // 256K tokens
    description: 'Most capable local Gemma 4, 256K context, Text + Image',
  },
  'gemma4:26b': {
    name: 'Gemma 4 26B',
    type: 'both' as const,
    thinking: false,
    contextWindow: 262144, // 256K tokens
    description: 'High capability Gemma 4, 256K context, Text + Image',
  },
  'gemma4:latest': {
    name: 'Gemma 4 Latest (9.6GB)',
    type: 'both' as const,
    thinking: false,
    contextWindow: 131072, // 128K tokens
    description: 'Gemma 4 default tag, 128K context, Text + Image',
  },
  'gemma4:e4b': {
    name: 'Gemma 4 E4B (9.6GB)',
    type: 'both' as const,
    thinking: false,
    contextWindow: 131072, // 128K tokens
    description: 'Gemma 4 Efficient 4B, 128K context, Text + Image',
  },
  'gemma4:e2b': {
    name: 'Gemma 4 E2B (7.2GB)',
    type: 'both' as const,
    thinking: false,
    contextWindow: 131072, // 128K tokens
    description: 'Gemma 4 Efficient 2B, lightest Gemma 4, 128K context',
  },
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;

// Per-model context window sizes (tokens) used to set num_ctx in Ollama
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gemma4:31b':    262144,
  'gemma4:26b':    262144,
  'gemma4:latest': 131072,
  'gemma4:e4b':    131072,
  'gemma4:e2b':    131072,
};

// Default models — gemma4 (9.6GB, 128K context) runs well on most VMs
const DEFAULT_CHAT_MODEL: ModelId = 'gemma4:latest';
const DEFAULT_STRUCTURED_MODEL: ModelId = 'gemma4:latest';

// In-memory model cache (refreshed from DB)
let currentChatModel: ModelId = DEFAULT_CHAT_MODEL;
let currentStructuredModel: ModelId = DEFAULT_STRUCTURED_MODEL;
let modelCacheTime = 0;
const MODEL_CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Get current model settings from database
 */
async function loadModelSettings(): Promise<void> {
  const now = Date.now();
  if (now - modelCacheTime < MODEL_CACHE_TTL) return;
  
  try {
    const chatModel = await getSetting('ai_chat_model');
    const structuredModel = await getSetting('ai_structured_model');
    
    if (chatModel && chatModel in AVAILABLE_MODELS) {
      currentChatModel = chatModel as ModelId;
    }
    if (structuredModel && structuredModel in AVAILABLE_MODELS) {
      currentStructuredModel = structuredModel as ModelId;
    }
    modelCacheTime = now;
  } catch (error) {
    console.error('Failed to load model settings:', error);
  }
}

/**
 * Set chat model
 */
export async function setChatModel(modelId: ModelId): Promise<boolean> {
  if (!(modelId in AVAILABLE_MODELS)) return false;
  await updateSetting('ai_chat_model', modelId);
  currentChatModel = modelId;
  modelCacheTime = 0; // Force refresh
  return true;
}

/**
 * Set structured output model
 */
export async function setStructuredModel(modelId: ModelId): Promise<boolean> {
  if (!(modelId in AVAILABLE_MODELS)) return false;
  await updateSetting('ai_structured_model', modelId);
  currentStructuredModel = modelId;
  modelCacheTime = 0; // Force refresh
  return true;
}

/**
 * Get current models
 */
export async function getCurrentModels(): Promise<{ chatModel: ModelId; structuredModel: ModelId }> {
  await loadModelSettings();
  return { chatModel: currentChatModel, structuredModel: currentStructuredModel };
}

// Select model based on task type
async function getModelForTask(type: string): Promise<string> {
  await loadModelSettings();
  
  // Use structured model for JSON extraction tasks (resume parsing)
  if (type === 'parse-pdf' || type === 'parse-resume' || type === 'parse-jobs-text') {
    return currentStructuredModel;
  }
  // Use chat model for general chat
  return currentChatModel;
}

// In-memory rate limiter (generous for local proxy)
let requestCount = 0;
let windowStart = Date.now();
const MAX_REQUESTS_PER_MINUTE = 60; // Local proxy can handle more

// In-memory L1 cache (avoids DB hits for repeated requests)
const memoryCache = new Map<string, { content: string; timestamp: number }>();
const MEMORY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_MEMORY_CACHE_SIZE = 100;

// Request deduplication - prevents duplicate concurrent requests
const pendingRequests = new Map<string, Promise<AIResponse>>();

interface AIRequestOptions {
  type: 'parse-resume' | 'parse-pdf' | 'parse-jobs-text' | 'chat';
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

interface AIResponse {
  content: string;
  cached: boolean;
  model: string;
}

/**
 * Generate SHA-256 hash for cache key
 */
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check rate limit (token bucket algorithm)
 */
function checkRateLimit(): boolean {
  const now = Date.now();
  const windowDuration = 60 * 1000; // 1 minute

  // Reset window if expired
  if (now - windowStart > windowDuration) {
    windowStart = now;
    requestCount = 0;
  }

  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    return false; // Rate limited
  }

  requestCount++;
  return true;
}

/**
 * Wait for rate limit to reset
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const waitTime = 60 * 1000 - (now - windowStart) + 1000; // Wait until window resets + 1s buffer
  
  if (waitTime > 0) {
    console.log(`Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    windowStart = Date.now();
    requestCount = 0;
  }
}

/**
 * Check L1 memory cache first, then L2 database cache
 */
async function getCachedResponse(
  contentHash: string,
  requestType: string
): Promise<string | null> {
  const cacheKey = `${requestType}:${contentHash}`;
  
  // L1: Check memory cache first (fastest)
  const memCached = memoryCache.get(cacheKey);
  if (memCached && (Date.now() - memCached.timestamp) < MEMORY_CACHE_TTL) {
    return memCached.content;
  }
  
  // L2: Check database cache
  const { data, error } = await supabase
    .from('ai_cache')
    .select('response')
    .eq('content_hash', contentHash)
    .eq('request_type', requestType)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;
  
  const content = JSON.stringify(data.response);
  
  // Populate L1 cache for future hits
  setMemoryCache(cacheKey, content);
  
  return content;
}

/**
 * Set memory cache with LRU eviction
 */
function setMemoryCache(key: string, content: string): void {
  // Evict oldest entries if cache is full
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { content, timestamp: Date.now() });
}

/**
 * Save response to cache (both L1 memory and L2 database)
 */
async function cacheResponse(
  contentHash: string,
  requestType: string,
  response: string
): Promise<void> {
  // L1: Update memory cache immediately
  const cacheKey = `${requestType}:${contentHash}`;
  setMemoryCache(cacheKey, response);
  
  // L2: Persist to database (async, non-blocking)
  const ttlHours = await getSettingNumber('ai_cache_ttl_hours');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(response);
  } catch {
    parsedResponse = { raw: response };
  }

  await supabase
    .from('ai_cache')
    .upsert({
      content_hash: contentHash,
      request_type: requestType,
      response: parsedResponse,
      expires_at: expiresAt.toISOString(),
    }, { onConflict: 'content_hash' });
}

/**
 * Make AI request to Ollama using the chat API
 * Automatically sets num_ctx based on the model's known context window
 */
async function makeAIRequest(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number
): Promise<{ content: string; success: boolean }> {
  // Check rate limit
  if (!checkRateLimit()) {
    await waitForRateLimit();
  }

  // Look up this model's context window (fall back to 128K for unknown models)
  const numCtx = MODEL_CONTEXT_WINDOWS[model] ?? 131072;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        options: {
          temperature: temperature,
          num_predict: maxTokens,
          num_ctx: numCtx,       // Tell Ollama to load the full context window
          repeat_penalty: 1.1,   // Reduce repetition — important for long structured output
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => '');
      console.error(`Ollama request failed (${response.status}):`, errorData);
      return { content: '', success: false };
    }

    const data = await response.json();
    
    // Extract text from Ollama response format
    const content = data?.message?.content || '';

    if (!content) {
      console.error('No content in Ollama response:', data);
      return { content: '', success: false };
    }

    return { content, success: true };
  } catch (error) {
    console.error('Ollama request failed:', error);
    return { content: '', success: false };
  }
}

/**
 * Main AI service function with caching, deduplication and fallback
 */
export async function callAI(options: AIRequestOptions): Promise<AIResponse> {
  const { type, systemPrompt, userPrompt, temperature = 0.3, maxTokens = 2000 } = options;

  // Generate cache key
  const cacheKey = hashContent(`${type}:${systemPrompt}:${userPrompt}`);
  const requestKey = `${type}:${cacheKey}`;

  // Check cache first (L1 memory, then L2 database)
  const cached = await getCachedResponse(cacheKey, type);
  if (cached) {
    console.log(`Cache HIT for ${type}`);
    return { content: cached, cached: true, model: 'cached' };
  }

  // Request deduplication: If same request is in-flight, wait for it
  const pending = pendingRequests.get(requestKey);
  if (pending) {
    console.log(`Dedup: Waiting for existing ${type} request...`);
    return pending;
  }

  console.log(`Cache MISS for ${type}, calling AI...`);

  // Create the request promise and store it for deduplication
  const requestPromise = executeAIRequest(cacheKey, type, systemPrompt, userPrompt, temperature, maxTokens);
  pendingRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    // Clean up pending request
    pendingRequests.delete(requestKey);
  }
}

/**
 * Execute the actual AI request (separated for deduplication)
 */
async function executeAIRequest(
  cacheKey: string,
  type: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number
): Promise<AIResponse> {
  // Select model based on task type (now async)
  const model = await getModelForTask(type);
  
  // Increase max tokens for structured extraction tasks.
  // gemma4:31b has 256K context so we give it room to breathe.
  const effectiveMaxTokens = (type === 'parse-pdf' || type === 'parse-resume' || type === 'parse-jobs-text') 
    ? Math.max(maxTokens, 16000) // Plenty of room for full JSON output
    : Math.max(maxTokens, 4096); // At least 4K for chat/other responses

  // Try with retries
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { content, success } = await makeAIRequest(
      model,
      systemPrompt,
      userPrompt,
      temperature,
      effectiveMaxTokens
    );

    if (success && content) {
      await cacheResponse(cacheKey, type, content);
      return { content, cached: false, model };
    }

    if (attempt < 3) {
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retry ${attempt}/3, waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Ollama failed after retries. Ensure it is running: ollama serve');
}

/**
 * Parse JSON from AI response (handles markdown code blocks)
 */
export function parseAIJSON<T>(content: string): T | null {
  let jsonStr = content;
  
  // Handle cached responses wrapped in {raw: "..."} 
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && 'raw' in parsed && typeof parsed.raw === 'string') {
      jsonStr = parsed.raw;
    }
  } catch {
    // Not valid JSON yet, continue with string processing
  }
  
  // Remove markdown code blocks
  jsonStr = jsonStr
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // Extract JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    console.error('Failed to parse AI JSON:', content.substring(0, 200));
    return null;
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  const { data, error } = await supabase
    .from('ai_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('Error cleaning up cache:', error);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`Cleaned up ${count} expired cache entries`);
  }
  
  return count;
}

/**
 * Check if Ollama proxy is running and healthy
 */
export async function checkProxyHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/version`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      return { ok: true, message: `Ollama is running (version ${data.version})` };
    }
    return { ok: false, message: `Ollama returned status ${response.status}` };
  } catch {
    return { 
      ok: false, 
      message: `Ollama not reachable at ${OLLAMA_URL}. Start it with: ollama serve` 
    };
  }
}

/**
 * Get the configured proxy URL
 */
export function getProxyUrl(): string {
  return OLLAMA_URL;
}

/**
 * Get all available models for UI selection
 */
export function getAvailableModels() {
  return AVAILABLE_MODELS;
}

/**
 * Get defaults
 */
export function getModelDefaults() {
  return {
    defaultChatModel: DEFAULT_CHAT_MODEL,
    defaultStructuredModel: DEFAULT_STRUCTURED_MODEL,
  };
}
