import { supabase, DBEmailAccount } from './supabase';
import { getSetting, getSettingNumber } from './settings';

// In-memory cache for accounts (refreshed every 30 seconds)
let accountsCache: EmailAccount[] | null = null;
let accountsCacheTimestamp = 0;
const ACCOUNTS_CACHE_TTL = 30 * 1000; // 30 seconds

export interface EmailAccount {
  id: string;
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  dailyLimit: number;
  replyReserve: number;
  sentToday: number;
  isExhausted: boolean;
  priority: number;
  isActive: boolean;
}

function mapDBAccount(db: DBEmailAccount): EmailAccount {
  return {
    id: db.id,
    name: db.name,
    email: db.email,
    smtpHost: db.smtp_host,
    smtpPort: db.smtp_port,
    smtpUser: db.smtp_user,
    smtpPass: db.smtp_pass,
    dailyLimit: db.daily_limit,
    replyReserve: db.reply_reserve,
    sentToday: db.sent_today,
    isExhausted: db.is_exhausted,
    priority: db.priority,
    isActive: db.is_active,
  };
}

export async function getActiveAccounts(forceRefresh = false): Promise<EmailAccount[]> {
  const now = Date.now();
  
  // Return cached accounts if still valid
  if (!forceRefresh && accountsCache && (now - accountsCacheTimestamp) < ACCOUNTS_CACHE_TTL) {
    return accountsCache;
  }

  const { data, error } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('Error fetching email accounts:', error);
    return accountsCache || [];
  }

  accountsCache = (data as DBEmailAccount[]).map(mapDBAccount);
  accountsCacheTimestamp = now;
  return accountsCache;
}

// Invalidate cache after updates
export function invalidateAccountsCache(): void {
  accountsCache = null;
}

export async function getAccountById(id: string): Promise<EmailAccount | null> {
  const { data, error } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return mapDBAccount(data as DBEmailAccount);
}

/**
 * Get the auto-send limit for an account (daily_limit - reply_reserve)
 */
export function getAutoSendLimit(account: EmailAccount): number {
  return account.dailyLimit - account.replyReserve;
}

/**
 * Check if an account can still auto-send emails
 */
export function canAutoSend(account: EmailAccount): boolean {
  if (account.isExhausted) return false;
  return account.sentToday < getAutoSendLimit(account);
}

/**
 * Get the first available account that can auto-send
 */
export async function getAvailableAccount(): Promise<EmailAccount | null> {
  const accounts = await getActiveAccounts();
  
  for (const account of accounts) {
    if (canAutoSend(account)) {
      return account;
    }
  }
  
  return null; // All accounts at reserve limit
}

/**
 * Increment the sent_today counter for an account
 */
export async function incrementSentCount(accountId: string): Promise<boolean> {
  // Invalidate cache since we're updating
  invalidateAccountsCache();
  
  const { error } = await supabase.rpc('increment_sent_count', { 
    account_id: accountId 
  });

  // If RPC doesn't exist, do it manually
  if (error) {
    const account = await getAccountById(accountId);
    if (!account) return false;

    const newCount = account.sentToday + 1;
    const isExhausted = newCount >= getAutoSendLimit(account);

    const { error: updateError } = await supabase
      .from('email_accounts')
      .update({ 
        sent_today: newCount,
        is_exhausted: isExhausted
      })
      .eq('id', accountId);

    return !updateError;
  }

  return true;
}

/**
 * Mark an account as exhausted (hit rate limit)
 */
export async function markAccountExhausted(accountId: string, error?: string): Promise<void> {
  await supabase
    .from('email_accounts')
    .update({ 
      is_exhausted: true,
      last_error: error || 'Rate limit reached'
    })
    .eq('id', accountId);
}

/**
 * Reset daily counters for all accounts (called by cron at midnight)
 */
export async function resetDailyCounters(): Promise<void> {
  const { error } = await supabase
    .from('email_accounts')
    .update({ 
      sent_today: 0,
      is_exhausted: false,
      last_error: null,
      last_reset_at: new Date().toISOString()
    })
    .eq('is_active', true);

  if (error) {
    console.error('Error resetting daily counters:', error);
  } else {
    console.log('Daily email counters reset successfully');
  }
}

/**
 * Get account usage statistics
 */
export async function getAccountStats(): Promise<{
  totalAutoSendRemaining: number;
  totalReplyReserve: number;
  accounts: Array<{
    id: string;
    name: string;
    email: string;
    sentToday: number;
    autoSendLimit: number;
    autoSendRemaining: number;
    replyReserve: number;
    isExhausted: boolean;
    isActive: boolean;
  }>;
  allAccounts: Array<{
    id: string;
    name: string;
    email: string;
    isActive: boolean;
  }>;
}> {
  // Get ALL accounts (including inactive) for the toggle UI
  const { data: allData } = await supabase
    .from('email_accounts')
    .select('id, name, email, is_active')
    .order('priority', { ascending: true });

  const allAccounts = (allData || []).map(acc => ({
    id: acc.id,
    name: acc.name,
    email: acc.email,
    isActive: acc.is_active,
  }));

  // Get only active accounts for stats
  const accounts = await getActiveAccounts();
  
  let totalAutoSendRemaining = 0;
  let totalReplyReserve = 0;

  const accountStats = accounts.map(acc => {
    const autoSendLimit = getAutoSendLimit(acc);
    const autoSendRemaining = Math.max(0, autoSendLimit - acc.sentToday);
    
    totalAutoSendRemaining += autoSendRemaining;
    totalReplyReserve += acc.replyReserve;

    return {
      id: acc.id,
      name: acc.name,
      email: acc.email,
      sentToday: acc.sentToday,
      autoSendLimit,
      autoSendRemaining,
      replyReserve: acc.replyReserve,
      isExhausted: acc.isExhausted,
      isActive: acc.isActive,
    };
  });

  return {
    totalAutoSendRemaining,
    totalReplyReserve,
    accounts: accountStats,
    allAccounts,
  };
}
