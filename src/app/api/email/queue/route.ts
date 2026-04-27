import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkDuplicate, checkDuplicatesBatch } from '@/lib/duplicate-checker';
import { sendEmailDirect } from '@/lib/email-sender';

interface SendEmailRequest {
  jobId?: string;
  profileId?: string;
  recruiterEmail: string;
  recruiterName?: string;
  jobTitle: string;
  company?: string;
  jobDescription: string;
  matchScore?: number;
  forceApply?: boolean; // Override duplicate check
  customSubject?: string; // Pre-edited subject
  customBody?: string; // Pre-edited body
  resumeAttachment?: {
    filename: string;
    content: string; // base64
  };
}

interface BulkSendRequest {
  applications: SendEmailRequest[];
  candidateName: string;
  candidateSkills: string[];
  candidateExperience: string;
  resumeAttachment?: {
    filename: string;
    content: string; // base64
  };
}

// Send a single email immediately
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Check if it's a bulk request
    if (Array.isArray(body.applications)) {
      return handleBulkSend(body as BulkSendRequest);
    }
    
    return handleSingleSend(body as SendEmailRequest & {
      candidateName: string;
      candidateSkills: string[];
      candidateExperience: string;
    });
  } catch (error) {
    console.error('Send email error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}

async function handleSingleSend(body: SendEmailRequest & {
  candidateName: string;
  candidateSkills: string[];
  candidateExperience: string;
}) {
  const {
    jobId,
    profileId,
    recruiterEmail,
    recruiterName,
    jobTitle,
    company,
    matchScore,
    forceApply,
    customSubject,
    customBody,
    resumeAttachment,
  } = body;

  if (!recruiterEmail || !jobTitle) {
    return NextResponse.json(
      { error: 'Missing required fields: recruiterEmail, jobTitle' },
      { status: 400 }
    );
  }

  if (!customSubject || !customBody) {
    return NextResponse.json(
      { error: 'Missing required fields: customSubject, customBody' },
      { status: 400 }
    );
  }

  // Check for duplicates unless force apply
  if (!forceApply) {
    const duplicateCheck = await checkDuplicate(recruiterEmail);
    
    if (duplicateCheck.isDuplicate) {
      return NextResponse.json({
        success: false,
        status: 'duplicate',
        isDuplicate: true,
        reason: duplicateCheck.reason,
        existingApplicationId: duplicateCheck.existingApplicationId,
      }, { status: 409 }); // Conflict
    }
  }

  // Create application record
  const { data: application, error: appError } = await supabase
    .from('applications')
    .insert({
      job_id: jobId,
      profile_id: profileId,
      recruiter_email: recruiterEmail.toLowerCase(),
      job_title: jobTitle,
      company,
      match_score: matchScore,
      status: 'sending',
    })
    .select('id')
    .single();

  if (appError) {
    console.error('Error creating application:', appError);
    return NextResponse.json(
      { error: 'Failed to create application record', status: 'failed' },
      { status: 500 }
    );
  }

  // Send the email immediately
  console.log('Sending email to:', recruiterEmail);
  const sendResult = await sendEmailDirect({
    applicationId: application.id,
    toEmail: recruiterEmail,
    toName: recruiterName,
    subject: customSubject,
    body: customBody,
    attachment: resumeAttachment,
  });
  console.log('Send result:', JSON.stringify(sendResult));

  if (sendResult.success) {
    return NextResponse.json({
      success: true,
      status: 'sent',
      applicationId: application.id,
      accountUsed: sendResult.accountUsed,
      message: 'Email sent successfully',
    });
  } else {
    return NextResponse.json({
      success: false,
      status: 'failed',
      applicationId: application.id,
      error: sendResult.error,
      message: 'Failed to send email',
    }, { status: 500 });
  }
}

async function handleBulkSend(body: BulkSendRequest) {
  const { applications, resumeAttachment } = body;

  if (!applications || applications.length === 0) {
    return NextResponse.json(
      { error: 'No applications provided' },
      { status: 400 }
    );
  }

  // Check all for duplicates at once
  const emails = applications.map(a => a.recruiterEmail);
  const duplicateResults = await checkDuplicatesBatch(emails);

  const results = {
    sent: 0,
    failed: 0,
    skippedDuplicate: 0,
    details: [] as Array<{
      recruiterEmail: string;
      status: 'sent' | 'failed' | 'duplicate';
      reason?: string;
      applicationId?: string;
    }>,
  };

  // Get delay setting for bulk sends
  const { data: settingsData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'delay_between_emails_ms')
    .single();
  const delayMs = settingsData?.value ? parseInt(settingsData.value) : 1000;

  for (const app of applications) {
    const duplicateCheck = duplicateResults.get(app.recruiterEmail.toLowerCase());

    // Skip duplicates unless force apply
    if (!app.forceApply && duplicateCheck?.isDuplicate) {
      results.skippedDuplicate++;
      results.details.push({
        recruiterEmail: app.recruiterEmail,
        status: 'duplicate',
        reason: duplicateCheck.reason,
      });
      continue;
    }

    // Must have subject and body
    if (!app.customSubject || !app.customBody) {
      results.failed++;
      results.details.push({
        recruiterEmail: app.recruiterEmail,
        status: 'failed',
        reason: 'Missing subject or body',
      });
      continue;
    }

    // Create application record
    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert({
        job_id: app.jobId,
        profile_id: app.profileId,
        recruiter_email: app.recruiterEmail.toLowerCase(),
        job_title: app.jobTitle,
        company: app.company,
        match_score: app.matchScore,
        status: 'sending',
      })
      .select('id')
      .single();

    if (appError) {
      results.failed++;
      results.details.push({
        recruiterEmail: app.recruiterEmail,
        status: 'failed',
        reason: 'Failed to create application record',
      });
      continue;
    }

    // Send the email immediately
    const sendResult = await sendEmailDirect({
      applicationId: application.id,
      toEmail: app.recruiterEmail,
      toName: app.recruiterName,
      subject: app.customSubject,
      body: app.customBody,
      attachment: app.resumeAttachment || resumeAttachment,
    });

    if (sendResult.success) {
      results.sent++;
      results.details.push({
        recruiterEmail: app.recruiterEmail,
        status: 'sent',
        applicationId: application.id,
      });
    } else {
      results.failed++;
      results.details.push({
        recruiterEmail: app.recruiterEmail,
        status: 'failed',
        reason: sendResult.error,
        applicationId: application.id,
      });
    }

    // Wait between emails to avoid rate limiting
    if (results.sent + results.failed < applications.length - results.skippedDuplicate) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      total: applications.length,
      sent: results.sent,
      failed: results.failed,
      skippedDuplicate: results.skippedDuplicate,
    },
    details: results.details,
  });
}
