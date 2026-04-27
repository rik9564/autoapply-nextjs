import nodemailer from 'nodemailer';
import { supabase, DBEmailTemplate, DBEmailQueue } from './supabase';
import { 
  EmailAccount, 
  getAvailableAccount, 
  incrementSentCount, 
  markAccountExhausted 
} from './gmail-accounts';
import { getSetting } from './settings';

interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  bodyHtml: string;
  attachment?: {
    filename: string;
    content: string; // base64 encoded
  };
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  accountUsed?: string;
}

/**
 * Create Nodemailer transport for a Gmail account
 */
function createTransport(account: EmailAccount) {
  // Port 465 uses SSL (secure: true), Port 587 uses TLS (secure: false)
  const isSecure = account.smtpPort === 465;
  
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: isSecure,
    auth: {
      user: account.smtpUser,
      pass: account.smtpPass,
    },
    // Add connection timeout
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Send a single email using available Gmail account
 */
export async function sendEmail(options: EmailOptions): Promise<SendResult> {
  const { to, toName, subject, bodyHtml, attachment } = options;

  console.log('sendEmail: Getting available account...');
  
  // Get available account
  const account = await getAvailableAccount();
  
  if (!account) {
    console.log('sendEmail: No available account found!');
    return {
      success: false,
      error: 'All email accounts have reached their daily auto-send limit',
    };
  }

  console.log('sendEmail: Using account:', account.email);
  const fromName = await getSetting('from_name');
  const transport = createTransport(account);

  try {
    // Build email options
    const mailOptions: {
      from: string;
      to: string;
      subject: string;
      html: string;
      attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
    } = {
      from: `"${fromName}" <${account.email}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      html: bodyHtml,
    };

    // Add attachment if provided
    if (attachment && attachment.content) {
      const contentType = attachment.filename.toLowerCase().endsWith('.pdf') 
        ? 'application/pdf' 
        : attachment.filename.toLowerCase().endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : attachment.filename.toLowerCase().endsWith('.doc')
        ? 'application/msword'
        : 'application/octet-stream';

      mailOptions.attachments = [{
        filename: attachment.filename,
        content: Buffer.from(attachment.content, 'base64'),
        contentType,
      }];
    }

    const info = await transport.sendMail(mailOptions);

    // Increment sent count
    await incrementSentCount(account.id);

    return {
      success: true,
      messageId: info.messageId,
      accountUsed: account.email,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's a rate limit error
    if (errorMessage.includes('rate') || errorMessage.includes('limit') || errorMessage.includes('quota')) {
      await markAccountExhausted(account.id, errorMessage);
      
      // Try with next account
      const nextAccount = await getAvailableAccount();
      if (nextAccount && nextAccount.id !== account.id) {
        console.log(`Retrying with account: ${nextAccount.email}`);
        return sendEmail(options); // Recursive retry with different account
      }
    }

    return {
      success: false,
      error: errorMessage,
      accountUsed: account.email,
    };
  }
}

/**
 * Get default email template
 */
async function getDefaultTemplate(): Promise<DBEmailTemplate | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('is_default', true)
    .single();

  if (error || !data) {
    console.error('Error fetching default template:', error);
    return null;
  }

  return data as DBEmailTemplate;
}

/**
 * Generate cover letter using template (no AI)
 */
export function generateCoverLetter(
  jobTitle: string,
  company: string,
  _jobDescription: string,
  _candidateName: string,
  candidateSkills: string[],
  _candidateExperience: string
): string {
  const topSkills = candidateSkills.slice(0, 3).join(', ');
  return `I am excited to apply for the ${jobTitle} position at ${company}. With my experience in ${topSkills}, I believe I would be a strong addition to your team. I am eager to contribute my skills and grow with your organization.`;
}

/**
 * Render email template with variables
 */
function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(regex, value || '');
  }
  
  return rendered;
}

/**
 * Send an email directly (no queue, immediate send)
 * Returns sent/failed status immediately
 */
export async function sendEmailDirect(params: {
  applicationId: string;
  toEmail: string;
  toName?: string;
  subject: string;
  body: string;
  attachment?: {
    filename: string;
    content: string; // base64
  };
}): Promise<{ success: boolean; status: 'sent' | 'failed'; error?: string; accountUsed?: string }> {
  const {
    applicationId,
    toEmail,
    toName,
    subject,
    body,
    attachment,
  } = params;

  console.log('sendEmailDirect called for:', toEmail);

  // Convert plain text to HTML (preserve line breaks)
  const bodyHtml = body
    .split('\n')
    .map(line => `<p>${line || '&nbsp;'}</p>`)
    .join('\n');

  // Send immediately
  console.log('Calling sendEmail...');
  const sendResult = await sendEmail({
    to: toEmail,
    toName,
    subject,
    bodyHtml,
    attachment,
  });
  console.log('sendEmail result:', sendResult.success ? 'success' : sendResult.error);

  // Update application status
  if (applicationId) {
    await supabase
      .from('applications')
      .update({
        status: sendResult.success ? 'sent' : 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);
  }

  if (sendResult.success) {
    return {
      success: true,
      status: 'sent',
      accountUsed: sendResult.accountUsed,
    };
  } else {
    return {
      success: false,
      status: 'failed',
      error: sendResult.error,
      accountUsed: sendResult.accountUsed,
    };
  }
}

/**
 * Process pending emails from queue
 */
export async function processEmailQueue(batchSize: number = 5): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  debug?: string;
}> {
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0, debug: '' };

  // Get pending emails
  const { data: emails, error } = await supabase
    .from('email_queue')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lt('retries', 3)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    result.debug = `Query error: ${error.message}`;
    console.error('Error fetching emails:', error);
    return result;
  }
  
  if (!emails || emails.length === 0) {
    result.debug = 'No pending emails found in queue';
    return result;
  }
  
  result.debug = `Found ${emails.length} emails to process`;
  console.log(`Processing ${emails.length} emails...`);

  const delayMs = parseInt(await getSetting('delay_between_emails_ms')) || 1000;

  for (const email of emails as DBEmailQueue[]) {
    result.processed++;

    // Mark as sending
    await supabase
      .from('email_queue')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', email.id);

    // Extract attachment from metadata if present
    let attachment: { filename: string; content: string } | undefined;
    if (email.metadata) {
      try {
        const metadata = typeof email.metadata === 'string' 
          ? JSON.parse(email.metadata) 
          : email.metadata;
        if (metadata?.attachment) {
          attachment = metadata.attachment;
        }
      } catch {
        console.warn('Failed to parse email metadata:', email.id);
      }
    }

    // Attempt to send
    const sendResult = await sendEmail({
      to: email.to_email,
      toName: email.to_name || undefined,
      subject: email.subject,
      bodyHtml: email.body_html,
      attachment,
    });

    if (sendResult.success) {
      result.sent++;
      
      // Update queue entry
      await supabase
        .from('email_queue')
        .update({
          status: 'sent',
          sent_via: sendResult.accountUsed,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', email.id);

      // Update application status
      if (email.application_id) {
        await supabase
          .from('applications')
          .update({
            status: 'sent',
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.application_id);
      }
    } else {
      result.failed++;
      
      const newRetries = email.retries + 1;
      const status = newRetries >= 3 ? 'failed' : 'pending';

      await supabase
        .from('email_queue')
        .update({
          status,
          retries: newRetries,
          error_message: sendResult.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', email.id);

      // If permanently failed, update application
      if (status === 'failed' && email.application_id) {
        await supabase
          .from('applications')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.application_id);
      }
    }

    // Wait between emails
    if (result.processed < emails.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return result;
}

/**
 * Get email statistics (from applications table - no queue)
 */
export async function getQueueStats(): Promise<{
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
}> {
  const { data, error } = await supabase
    .from('applications')
    .select('status');

  if (error || !data) {
    return { pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, total: 0 };
  }

  const stats = {
    pending: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    total: data.length,
  };

  for (const item of data) {
    const status = item.status as keyof typeof stats;
    if (status in stats) {
      stats[status]++;
    }
  }

  return stats;
}
