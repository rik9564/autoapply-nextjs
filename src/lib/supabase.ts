import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Singleton client with optimized settings
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Server-side, no need for session persistence
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-app-name': 'autoapply',
    },
  },
});

// Database Types
export interface DBSetting {
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

export interface DBEmailAccount {
  id: string;
  name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  daily_limit: number;
  reply_reserve: number;
  sent_today: number;
  is_exhausted: boolean;
  priority: number;
  is_active: boolean;
  last_error?: string;
  last_reset_at: string;
  created_at: string;
}

export interface DBEmailTemplate {
  id: string;
  name: string;
  subject_template: string;
  body_template: string;
  is_default: boolean;
  created_at: string;
}

export interface DBProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  summary?: string;
  skills?: string[];
  experience?: Record<string, unknown>[];
  education?: Record<string, unknown>[];
  total_years_experience?: number;
  top_skill_categories?: string[];
  resume_text?: string;
  created_at: string;
}

export interface DBJob {
  id: string;
  job_title: string;
  company?: string;
  recruiter_name?: string;
  recruiter_email?: string;
  recruiter_phone?: string;
  job_description?: string;
  location?: string;
  work_type?: string;
  experience_level?: string;
  salary_range?: string;
  skills?: string[];
  job_type?: string;
  source_file?: string;
  created_at: string;
}

export interface DBApplication {
  id: string;
  job_id?: string;
  profile_id?: string;
  recruiter_email: string;
  job_title: string;
  company?: string;
  match_score?: number;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'replied' | 'failed' | 'skipped';
  applied_at: string;
  updated_at: string;
}

export interface DBEmailQueue {
  id: string;
  application_id?: string;
  to_email: string;
  to_name?: string;
  subject: string;
  body_html: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  skip_reason?: string;
  retries: number;
  error_message?: string;
  sent_via?: string;
  sent_at?: string;
  metadata?: string | Record<string, unknown>; // JSON metadata for attachments etc.
  created_at: string;
  updated_at: string;
}

export interface DBAICache {
  id: string;
  content_hash: string;
  request_type: string;
  response: Record<string, unknown>;
  expires_at: string;
  created_at: string;
}
