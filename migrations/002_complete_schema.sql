-- =============================================
-- AutoApply Database Schema - COMPLETE SETUP
-- Run this ONCE in Supabase SQL Editor
-- =============================================

-- 1. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
  ('from_name', 'Agniva', 'Name shown in email From field'),
  ('delay_between_emails_ms', '2000', 'Delay between sending emails in milliseconds'),
  ('duplicate_check_days', '30', 'Number of days to check for duplicate applications'),
  ('daily_limit_per_account', '400', 'Default daily email limit per account'),
  ('reply_reserve', '10', 'Reserve emails for replies (not auto-send)')
ON CONFLICT (key) DO NOTHING;

-- 2. EMAIL ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  smtp_host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
  smtp_port INTEGER NOT NULL DEFAULT 465,
  smtp_user TEXT NOT NULL,
  smtp_pass TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 400,
  reply_reserve INTEGER NOT NULL DEFAULT 10,
  sent_today INTEGER NOT NULL DEFAULT 0,
  is_exhausted BOOLEAN NOT NULL DEFAULT FALSE,
  exhausted_reason TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT,
  profile_id TEXT,
  recruiter_email TEXT NOT NULL,
  job_title TEXT,
  company TEXT,
  match_score INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_recruiter_email ON applications(LOWER(recruiter_email));
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON applications(applied_at);

-- 4. EMAIL TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO email_templates (name, subject_template, body_template, is_default) VALUES
  ('Default', 'Application for {{job_title}} | {{candidate_name}}',
   '<p>Dear {{recruiter_name}},</p><p>{{cover_letter}}</p><p>Best regards,<br>{{candidate_name}}</p>', TRUE)
ON CONFLICT DO NOTHING;

-- 5. SAVED PROMPTS TABLE (for backup)
CREATE TABLE IF NOT EXISTS saved_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  prompt TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default job parsing prompt
INSERT INTO saved_prompts (name, prompt, description) VALUES
  ('job_parser', 'Parse this job listings document and extract ALL job postings into a JSON array.

For EACH job posting, extract these fields (use null if not found):

{
  "company_name": "Company or organization name",
  "position": "Job title/role",
  "location": "City or location",
  "experience": "Years of experience required",
  "skills": ["Array of required skills"],
  "contact_email": "Email address to apply",
  "contact_phone": "Phone/WhatsApp number",
  "contact_name": "HR/Recruiter name",
  "work_mode": "WFO/WFH/Hybrid/Onsite/Remote",
  "salary": "CTC/Salary if mentioned"
}

Rules:
1. Extract contact_name from email prefix or mentioned names
2. Skills must be an array, even if single skill
3. Return ONLY valid JSON array, no explanations
4. Skip job postings with no contact email AND no phone
5. Combine duplicate postings for same company+role

Output format:
[
  { job1 },
  { job2 },
  ...
]', 'AI prompt for parsing job listings')
ON CONFLICT (name) DO NOTHING;

-- 6. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION increment_sent_count(account_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE email_accounts SET sent_today = sent_today + 1, last_sent_at = NOW(), updated_at = NOW() WHERE id = account_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reset_daily_counters() RETURNS VOID AS $$
BEGIN
  UPDATE email_accounts SET sent_today = 0, is_exhausted = FALSE, exhausted_reason = NULL, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 7. ADD YOUR EMAIL ACCOUNTS
-- =============================================

INSERT INTO email_accounts (name, email, smtp_user, smtp_pass, smtp_port, smtp_host, is_active, priority) VALUES
  ('Agniva Primary', 'agniva179@gmail.com', 'agniva179@gmail.com', 'ecojtxzsbfukgapj', 465, 'smtp.gmail.com', TRUE, 1),
  ('Agniva Secondary', 'agniva3799@gmail.com', 'agniva3799@gmail.com', 'okosdnlckotdpbug', 465, 'smtp.gmail.com', FALSE, 2)
ON CONFLICT (email) DO UPDATE SET 
  smtp_pass = EXCLUDED.smtp_pass,
  smtp_port = EXCLUDED.smtp_port,
  is_active = EXCLUDED.is_active,
  priority = EXCLUDED.priority,
  updated_at = NOW();

-- =============================================
-- DONE! Just copy this entire file and run in Supabase SQL Editor.
-- =============================================
