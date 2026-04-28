export interface Job {
  id: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone?: string;
  jobTitle: string;
  jobDescription: string;
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  aiAnalysis?: string;
  matchScore?: number;
  // Enriched fields (AI-extracted from job posting)
  company?: string;
  location?: string;
  workType?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  experienceLevel?: string;
  salaryRange?: string;
  skills?: string[];
  jobType?: 'fulltime' | 'contract' | 'parttime' | 'internship' | 'unknown';
  // Match analysis fields
  matchingSkills?: string[];
  missingSkills?: string[];
  whyMatched?: string;
  tier?: 1 | 2 | 3;
  recruiterEmailBody?: string;
  recruiterEmailSubject?: string;
  experienceMatch?: 'strong' | 'moderate' | 'weak' | 'unknown';
  experienceNotes?: string;
  recommendations?: string[];
  interviewTips?: string[];
  // Application tracking
  applicationStatus?: 'not-applied' | 'pending' | 'sent' | 'failed' | 'duplicate';
  applicationId?: string;
  duplicateReason?: string;
}

export interface ResumeProfile {
  name: string;
  email: string;
  phone: string;
  summary: string;
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
}

export interface Candidate {
  name: string;
  email: string;
  phone: string;
  experience?: number; // Years of experience for filtering jobs
  noticePeriod?: number; // Notice period in days
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface ProcessResponse {
  results: {
    jobId: string;
    status: 'success' | 'error';
    message?: string;
  }[];
}

// Email System Types
export interface EmailAccountStatus {
  id: string;
  name: string;
  email: string;
  sentToday: number;
  autoSendLimit: number;
  autoSendRemaining: number;
  replyReserve: number;
  isExhausted: boolean;
  isActive: boolean;
}

export interface EmailAccountBasic {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export interface EmailQueueStatus {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface EmailStatus {
  queue: EmailQueueStatus;
  accounts: {
    totalAutoSendRemaining: number;
    totalReplyReserve: number;
    accounts: EmailAccountStatus[];
    allAccounts: EmailAccountBasic[];
  };
  recentEmails: Array<{
    id: string;
    to_email: string;
    subject: string;
    status: string;
    error_message?: string;
    sent_at?: string;
    created_at: string;
  }>;
  retryableEmails: Array<{
    id: string;
    to_email: string;
    subject: string;
    retries: number;
    error_message?: string;
  }>;
}

export interface QueueEmailRequest {
  jobId?: string;
  profileId?: string;
  recruiterEmail: string;
  recruiterName?: string;
  jobTitle: string;
  company?: string;
  jobDescription: string;
  matchScore?: number;
  forceApply?: boolean;
  candidateName: string;
  candidateSkills: string[];
  candidateExperience: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: string;
  existingApplicationId?: string;
}

// System Status Types
export interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'degraded' | 'checking';
  message: string;
  details?: Record<string, unknown>;
}

export interface SystemStatus {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'offline';
  services: {
    server: ServiceStatus;
    ollama: ServiceStatus;
    database: ServiceStatus;
  };
  config: {
    proxyUrl: string;
    models: {
      chat: string;
      structured: string;
    };
  };
}
