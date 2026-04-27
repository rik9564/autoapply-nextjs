import { NextRequest, NextResponse } from 'next/server';
import { resetDailyCounters } from '@/lib/gmail-accounts';
import { cleanupExpiredCache } from '@/lib/ai-service';
import { supabase } from '@/lib/supabase';

// Daily reset cron job
// Resets email account counters and cleans up old data
// Should be called at midnight IST (18:30 UTC)
export async function GET(request: NextRequest) {
  try {
    const results = {
      countersReset: false,
      cacheCleanup: 0,
      oldEmailsArchived: 0,
    };

    // 1. Reset daily email counters
    await resetDailyCounters();
    results.countersReset = true;
    console.log('Daily email counters reset');

    // 2. Clean up expired AI cache
    results.cacheCleanup = await cleanupExpiredCache();

    // 3. Archive old sent emails (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: oldEmails } = await supabase
      .from('email_queue')
      .delete()
      .eq('status', 'sent')
      .lt('sent_at', thirtyDaysAgo.toISOString())
      .select('id');

    results.oldEmailsArchived = oldEmails?.length || 0;
    if (results.oldEmailsArchived > 0) {
      console.log(`Archived ${results.oldEmailsArchived} old sent emails`);
    }

    return NextResponse.json({
      success: true,
      message: 'Daily reset completed',
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Daily reset error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reset failed' },
      { status: 500 }
    );
  }
}

// Allow POST for Vercel Cron
export async function POST(request: NextRequest) {
  return GET(request);
}
