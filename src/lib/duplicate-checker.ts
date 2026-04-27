import { supabase } from './supabase';
import { getSettingNumber } from './settings';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: string;
  existingApplicationId?: string;
}

/**
 * Check if an application to this recruiter email already exists
 * Uses exact email match only (Option A)
 */
export async function checkDuplicate(
  recruiterEmail: string
): Promise<DuplicateCheckResult> {
  if (!recruiterEmail || !recruiterEmail.trim()) {
    return { isDuplicate: false };
  }

  const checkDays = await getSettingNumber('duplicate_check_days');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - checkDays);

  // Check if we've already emailed this recruiter
  const { data, error } = await supabase
    .from('applications')
    .select('id, job_title, company, applied_at, status')
    .ilike('recruiter_email', recruiterEmail.trim())
    .not('status', 'in', '("failed","skipped")')
    .gte('applied_at', cutoffDate.toISOString())
    .order('applied_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error checking for duplicates:', error);
    return { isDuplicate: false }; // Allow sending if check fails
  }

  if (data && data.length > 0) {
    const existing = data[0];
    const appliedDate = new Date(existing.applied_at).toLocaleDateString();
    
    return {
      isDuplicate: true,
      reason: `Already contacted ${recruiterEmail} on ${appliedDate} for "${existing.job_title}"${existing.company ? ` at ${existing.company}` : ''}`,
      existingApplicationId: existing.id,
    };
  }

  return { isDuplicate: false };
}

/**
 * Check multiple recruiter emails for duplicates
 */
export async function checkDuplicatesBatch(
  recruiterEmails: string[]
): Promise<Map<string, DuplicateCheckResult>> {
  const results = new Map<string, DuplicateCheckResult>();
  
  if (recruiterEmails.length === 0) {
    return results;
  }

  const checkDays = await getSettingNumber('duplicate_check_days');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - checkDays);

  // Normalize emails
  const normalizedEmails = recruiterEmails.map(e => e.trim().toLowerCase());

  // Query all at once
  const { data, error } = await supabase
    .from('applications')
    .select('id, recruiter_email, job_title, company, applied_at, status')
    .not('status', 'in', '("failed","skipped")')
    .gte('applied_at', cutoffDate.toISOString());

  if (error) {
    console.error('Error checking for duplicates:', error);
    // Return all as not duplicate if check fails
    recruiterEmails.forEach(email => {
      results.set(email.toLowerCase(), { isDuplicate: false });
    });
    return results;
  }

  // Build lookup map from existing applications
  const existingByEmail = new Map<string, typeof data[0]>();
  if (data) {
    for (const app of data) {
      const email = app.recruiter_email.toLowerCase();
      // Keep the most recent application for each email
      if (!existingByEmail.has(email)) {
        existingByEmail.set(email, app);
      }
    }
  }

  // Check each email
  for (const email of normalizedEmails) {
    const existing = existingByEmail.get(email);
    
    if (existing) {
      const appliedDate = new Date(existing.applied_at).toLocaleDateString();
      results.set(email, {
        isDuplicate: true,
        reason: `Already contacted on ${appliedDate} for "${existing.job_title}"${existing.company ? ` at ${existing.company}` : ''}`,
        existingApplicationId: existing.id,
      });
    } else {
      results.set(email, { isDuplicate: false });
    }
  }

  return results;
}

/**
 * Get count of emails sent to this recruiter
 */
export async function getRecruiterContactCount(recruiterEmail: string): Promise<number> {
  const { count, error } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .ilike('recruiter_email', recruiterEmail.trim())
    .not('status', 'in', '("failed","skipped")');

  if (error) {
    console.error('Error counting recruiter contacts:', error);
    return 0;
  }

  return count || 0;
}
