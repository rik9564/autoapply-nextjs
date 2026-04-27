import { supabase, DBSetting } from './supabase';

// In-memory cache for settings (refreshed every 5 minutes)
let settingsCache: Map<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getAllSettings(): Promise<Map<string, string>> {
  const now = Date.now();
  
  if (settingsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return settingsCache;
  }

  const { data, error } = await supabase
    .from('settings')
    .select('key, value');

  if (error) {
    console.error('Error fetching settings:', error);
    // Return cached version if available, or defaults
    if (settingsCache) return settingsCache;
    return getDefaultSettings();
  }

  settingsCache = new Map((data as DBSetting[]).map(s => [s.key, s.value]));
  cacheTimestamp = now;
  
  return settingsCache;
}

export async function getSetting(key: string): Promise<string> {
  const settings = await getAllSettings();
  return settings.get(key) ?? getDefaultValue(key);
}

export async function getSettingNumber(key: string): Promise<number> {
  const value = await getSetting(key);
  return parseInt(value, 10);
}

export async function updateSetting(key: string, value: string): Promise<boolean> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) {
    console.error('Error updating setting:', error);
    return false;
  }

  // Invalidate cache
  settingsCache = null;
  return true;
}

export function invalidateSettingsCache(): void {
  settingsCache = null;
}

function getDefaultSettings(): Map<string, string> {
  return new Map([
    ['reply_reserve', '30'],
    ['emails_per_batch', '5'],
    ['delay_between_emails_ms', '3000'],
    ['max_retries', '3'],
    ['ai_cache_ttl_hours', '24'],
    ['primary_ai_model', 'llama-3.3-70b-versatile'], // Groq's fastest model
    ['duplicate_check_days', '30'],
    ['from_name', 'Agniva Chowdhury'],
    ['default_template', 'software-engineer'], // Template ID from email-templates.ts
    ['use_ai_emails', 'false'], // false = use hardcoded templates, true = AI-generated
  ]);
}

function getDefaultValue(key: string): string {
  const defaults = getDefaultSettings();
  return defaults.get(key) ?? '';
}
