import { supabase, DBProfile } from './supabase';
import crypto from 'crypto';

export interface ResumeAnalysis {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  summary?: string;
  skills: string[];
  experience: {
    title: string;
    company: string;
    duration: string;
    highlights: string[];
  }[];
  education: {
    degree: string;
    institution: string;
    year: string;
  }[];
  totalYearsExperience: number;
  topSkillCategories: string[];
  resumeHash: string;
  createdAt: string;
}

/**
 * Generate a hash of resume text for deduplication
 */
export function generateResumeHash(resumeText: string): string {
  // Normalize text: remove extra whitespace, lowercase
  const normalized = resumeText.toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
}

/**
 * Get stored resume analysis by hash (for exact match)
 */
export async function getStoredAnalysisByHash(resumeHash: string): Promise<ResumeAnalysis | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('resume_hash', resumeHash)
      .single();

    if (error || !data) {
      return null;
    }

    return mapDBProfileToAnalysis(data);
  } catch {
    return null;
  }
}

/**
 * Get the most recent/active resume analysis
 */
export async function getActiveResumeAnalysis(): Promise<ResumeAnalysis | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return mapDBProfileToAnalysis(data);
  } catch {
    return null;
  }
}

/**
 * Get resume analysis by ID
 */
export async function getResumeAnalysisById(id: string): Promise<ResumeAnalysis | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return mapDBProfileToAnalysis(data);
  } catch {
    return null;
  }
}

/**
 * Store resume analysis in database
 */
export async function storeResumeAnalysis(
  analysis: {
    name: string;
    email?: string;
    phone?: string;
    summary?: string;
    skills: string[];
    experience: { title: string; company: string; duration: string; highlights: string[] }[];
    education: { degree: string; institution: string; year: string }[];
    totalYearsExperience: number;
    topSkillCategories: string[];
  },
  resumeText: string
): Promise<ResumeAnalysis> {
  const resumeHash = generateResumeHash(resumeText);

  // Check if we already have this exact resume
  const existing = await getStoredAnalysisByHash(resumeHash);
  if (existing) {
    console.log('Resume already analyzed, returning cached analysis');
    return existing;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      name: analysis.name,
      email: analysis.email || null,
      phone: analysis.phone || null,
      summary: analysis.summary || null,
      skills: analysis.skills,
      experience: analysis.experience,
      education: analysis.education,
      total_years_experience: analysis.totalYearsExperience,
      top_skill_categories: analysis.topSkillCategories,
      resume_text: resumeText.substring(0, 50000), // Store first 50k chars
      resume_hash: resumeHash,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store resume analysis: ${error.message}`);
  }

  console.log(`Resume analysis stored with ID: ${data.id}`);
  return mapDBProfileToAnalysis(data);
}

/**
 * Delete a resume analysis
 */
export async function deleteResumeAnalysis(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id);

  return !error;
}

/**
 * List all stored resume analyses
 */
export async function listResumeAnalyses(): Promise<ResumeAnalysis[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map(mapDBProfileToAnalysis);
}

/**
 * Map database profile to ResumeAnalysis interface
 */
function mapDBProfileToAnalysis(data: DBProfile & { resume_hash?: string }): ResumeAnalysis {
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    summary: data.summary,
    skills: data.skills || [],
    experience: (data.experience || []) as ResumeAnalysis['experience'],
    education: (data.education || []) as ResumeAnalysis['education'],
    totalYearsExperience: data.total_years_experience || 0,
    topSkillCategories: data.top_skill_categories || [],
    resumeHash: data.resume_hash || '',
    createdAt: data.created_at,
  };
}
