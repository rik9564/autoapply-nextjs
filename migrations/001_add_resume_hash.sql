-- Migration: Add resume_hash column to profiles table
-- This enables efficient lookup of previously analyzed resumes

-- Add the resume_hash column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS resume_hash VARCHAR(32);

-- Add resume_text column if it doesn't exist (to store the original text)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS resume_text TEXT;

-- Create index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_profiles_resume_hash ON profiles(resume_hash);

-- Note: Run this SQL in your Supabase SQL Editor:
-- 1. Go to your Supabase dashboard
-- 2. Click on "SQL Editor"
-- 3. Paste this SQL and run it
