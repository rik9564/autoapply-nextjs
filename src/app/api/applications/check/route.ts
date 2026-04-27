import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface ApplicationHistory {
  recruiterEmail: string;
  appliedAt: string;
  jobTitle: string;
  company: string;
  status: string;
}

// Check which recruiter emails have been contacted before
export async function POST(request: NextRequest) {
  try {
    const { emails } = await request.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ history: {} });
    }

    // Normalize emails to lowercase
    const normalizedEmails = emails
      .filter((e: string) => e && typeof e === 'string')
      .map((e: string) => e.toLowerCase().trim());

    if (normalizedEmails.length === 0) {
      return NextResponse.json({ history: {} });
    }

    // Query database for all applications to these emails
    const { data, error } = await supabase
      .from('applications')
      .select('recruiter_email, job_title, company, status, applied_at')
      .in('recruiter_email', normalizedEmails)
      .not('status', 'eq', 'failed') // Don't count failed attempts
      .order('applied_at', { ascending: false });

    if (error) {
      console.error('Error checking applications:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build history map - one entry per email (most recent)
    const history: Record<string, ApplicationHistory> = {};
    
    for (const app of data || []) {
      const email = app.recruiter_email.toLowerCase();
      // Only keep the most recent (first one due to order by desc)
      if (!history[email]) {
        history[email] = {
          recruiterEmail: email,
          appliedAt: app.applied_at,
          jobTitle: app.job_title || '',
          company: app.company || '',
          status: app.status || 'sent',
        };
      }
    }

    return NextResponse.json({
      success: true,
      history,
      checkedCount: normalizedEmails.length,
      foundCount: Object.keys(history).length,
    });
  } catch (error) {
    console.error('Check applications error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check' },
      { status: 500 }
    );
  }
}
