import { NextRequest, NextResponse } from 'next/server';
import { processEmailQueue } from '@/lib/email-sender';
import { getSettingNumber } from '@/lib/settings';
import { getAvailableAccount, getAccountStats } from '@/lib/gmail-accounts';

// Process pending emails from queue
// Called by Vercel Cron every 2 minutes
export async function POST(request: NextRequest) {
  try {
    // Check if we have available accounts
    const account = await getAvailableAccount();
    
    if (!account) {
      const stats = await getAccountStats();
      return NextResponse.json({
        success: true,
        message: 'All accounts at reserve limit. No emails sent.',
        accountStats: stats,
        processed: 0,
        sent: 0,
        failed: 0,
      });
    }

    // Get batch size from settings
    const batchSize = await getSettingNumber('emails_per_batch');

    // Process emails
    const result = await processEmailQueue(batchSize);

    // Get updated stats
    const stats = await getAccountStats();

    return NextResponse.json({
      success: true,
      message: `Processed ${result.processed} emails: ${result.sent} sent, ${result.failed} failed`,
      ...result,
      accountStats: stats,
    });
  } catch (error) {
    console.error('Process email error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process emails' },
      { status: 500 }
    );
  }
}

// Also allow GET for manual triggering
export async function GET(request: NextRequest) {
  return POST(request);
}
