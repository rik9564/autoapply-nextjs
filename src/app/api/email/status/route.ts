import { NextRequest, NextResponse } from 'next/server';
import { getQueueStats } from '@/lib/email-sender';
import { getAccountStats } from '@/lib/gmail-accounts';
import { supabase } from '@/lib/supabase';

// Get email queue and account status
export async function GET(request: NextRequest) {
  try {
    // Get queue stats
    const queueStats = await getQueueStats();
    
    // Get account stats
    const accountStats = await getAccountStats();

    // Get recent emails
    const { data: recentEmails } = await supabase
      .from('email_queue')
      .select('id, to_email, subject, status, error_message, sent_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    // Get failed emails that can be retried
    const { data: retryableEmails } = await supabase
      .from('email_queue')
      .select('id, to_email, subject, retries, error_message')
      .eq('status', 'failed')
      .lt('retries', 3);

    return NextResponse.json({
      success: true,
      queue: queueStats,
      accounts: accountStats,
      recentEmails: recentEmails || [],
      retryableEmails: retryableEmails || [],
    });
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    );
  }
}

// Retry a specific failed email
export async function POST(request: NextRequest) {
  try {
    const { emailId, retryAll } = await request.json();

    if (retryAll) {
      // Reset all failed emails with retries < 3 to pending
      const { data, error } = await supabase
        .from('email_queue')
        .update({ 
          status: 'pending',
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('status', 'failed')
        .lt('retries', 3)
        .select('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `${data?.length || 0} emails queued for retry`,
      });
    }

    if (!emailId) {
      return NextResponse.json(
        { error: 'emailId is required' },
        { status: 400 }
      );
    }

    // Reset specific email to pending
    const { error } = await supabase
      .from('email_queue')
      .update({ 
        status: 'pending',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', emailId)
      .eq('status', 'failed');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Email queued for retry',
    });
  } catch (error) {
    console.error('Retry error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retry' },
      { status: 500 }
    );
  }
}
