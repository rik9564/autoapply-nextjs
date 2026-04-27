"use client";
import React, { useState, useEffect, ChangeEvent, useCallback, useMemo } from "react";
import { 
  User, FileText, Plus, Eye, Zap, Edit3,
  CheckCircle2, X, LayoutDashboard, 
  Clock, Brain, Target, AlertTriangle, Sparkles,
  Send, Mail, RefreshCw, CheckCheck, AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Candidate, Job, EmailAccountStatus, EmailQueueStatus, EmailStatus as EmailStatusType } from "@/types";
import { getDefaultTemplate, fillTemplate, EmailTemplate } from "@/lib/email-templates";

// --- Design System Components ---

interface ButtonProps {
  children?: React.ReactNode;
  variant?: "primary" | "ghost" | "outline";
  size?: "xs" | "sm" | "md";
  className?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Button = ({ children, variant = "primary", size = "sm", className, icon, onClick, disabled, loading }: ButtonProps) => {
  const base = "inline-flex items-center justify-center font-medium rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-[#EDEDED] text-black hover:bg-white border border-transparent shadow-sm",
    ghost: "bg-transparent text-[#A1A1A1] hover:text-[#EDEDED] hover:bg-[#1A1A1A]",
    outline: "border border-[#2F2F2F] text-[#EDEDED] hover:border-[#444] bg-transparent"
  };
  const sizes: Record<string, string> = {
    xs: "text-[10px] px-2 h-6 gap-1.5",
    sm: "text-xs px-3 h-8 gap-2",
    md: "text-sm px-4 h-10 gap-2"
  };

  return (
    <button onClick={onClick} disabled={disabled || loading} className={cn(base, variants[variant], sizes[size], className)}>
      {loading ? <Clock className="w-3 h-3 animate-spin" /> : icon}
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: InputProps) => (
  <div className="space-y-1.5">
    {label && <label className="text-xs uppercase font-semibold text-[#525252] tracking-wider ml-0.5">{label}</label>}
    <input className="w-full h-10 px-3 text-sm bg-[#0A0A0A] border border-[#1F1F1F] rounded focus:border-[#525252] focus:bg-[#0F0F0F] transition-colors" {...props} />
  </div>
);

// --- Main Application ---

export default function Page() {
  const [candidate, setCandidate] = useState<Candidate>({ name: "", email: "", phone: "", experience: undefined });
  const [experienceMonths, setExperienceMonths] = useState<number | undefined>(undefined);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeBase64, setResumeBase64] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [previewJob, setPreviewJob] = useState<Job | null>(null);
  
  // Email system state
  const [emailStatus, setEmailStatus] = useState<EmailStatusType | null>(null);
  const [emailStatusLoading, setEmailStatusLoading] = useState(false);
  const [applyingJobIds, setApplyingJobIds] = useState<Set<string>>(new Set());
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  
  // Application history from database - tracks previously contacted HRs
  const [applicationHistory, setApplicationHistory] = useState<Map<string, { 
    appliedAt: string; 
    jobTitle: string; 
    company: string; 
    status: string;
  }>>(new Map());
  
  // Email preview/edit modal state
  const [emailPreview, setEmailPreview] = useState<{
    job: Job;
    subject: string;
    body: string;
    forceApply: boolean;
    generating: boolean;
  } | null>(null);

  // Bulk apply progress state
  const [bulkApplyProgress, setBulkApplyProgress] = useState<{
    isRunning: boolean;
    total: number;
    current: number;
    sent: number;
    failed: number;
    skipped: number;
    currentEmail: string;
    currentCompany: string;
  } | null>(null);

  // Job text input modal state
  const [showJobTextModal, setShowJobTextModal] = useState(false);
  const [jobTextInput, setJobTextInput] = useState("");

  // Email template state - persistent and editable
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate>(() => getDefaultTemplate());
  const [templateExpanded, setTemplateExpanded] = useState(true);
  const [parsingJobText, setParsingJobText] = useState(false);

  // Preview job email editing state
  const [previewJobEmail, setPreviewJobEmail] = useState<{ recipientEmail: string; subject: string; body: string } | null>(null);

  // Saved prompt backup state
  const [savedPrompt, setSavedPrompt] = useState<string>("");
  const [savedPromptUpdatedAt, setSavedPromptUpdatedAt] = useState<string>("");
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  // Live preview of filled email template
  const filledTemplate = useMemo(() => {
    return fillTemplate(emailTemplate, {
      company: '{{company}}',
      position: '{{position}}',
      your_name: candidate.name || '{{your_name}}',
      email: candidate.email || '{{email}}',
      phone: candidate.phone || '{{phone}}',
      experience: candidate.experience ?? '{{experience}}',
      notice_period: candidate.noticePeriod ?? '{{notice_period}}',
    });
  }, [emailTemplate, candidate]);

  // Check if template has all required variables filled
  const templateStatus = useMemo(() => {
    const issues: string[] = [];
    if (!candidate.name) issues.push('Name missing');
    if (!candidate.email) issues.push('Email missing');
    if (!candidate.phone) issues.push('Phone missing');
    if (candidate.experience === undefined) issues.push('Experience missing');
    if (candidate.noticePeriod === undefined) issues.push('Notice period missing');
    return {
      isComplete: issues.length === 0,
      issues,
    };
  }, [candidate]);

  // When preview job changes, fill the email template for that job
  useEffect(() => {
    if (previewJob) {
      const filled = fillTemplate(emailTemplate, {
        company: previewJob.company || 'your company',
        position: previewJob.jobTitle || '',
        your_name: candidate.name || '',
        email: candidate.email || '',
        phone: candidate.phone || '',
        experience: candidate.experience ?? '',
        notice_period: candidate.noticePeriod ?? '',
      });
      setPreviewJobEmail({
        recipientEmail: previewJob.recruiterEmail || '',
        ...filled,
      });
    } else {
      setPreviewJobEmail(null);
    }
  }, [previewJob, emailTemplate, candidate]);

  // Format experience as "X years Y months" for display
  const formatExperience = (years: number | undefined, months: number | undefined): string => {
    if (years === undefined && months === undefined) return '';
    const y = years ?? 0;
    const m = months ?? 0;
    if (y === 0 && m === 0) return '0 years';
    const parts: string[] = [];
    if (y > 0) parts.push(`${y} year${y !== 1 ? 's' : ''}`);
    if (m > 0) parts.push(`${m} month${m !== 1 ? 's' : ''}`);
    return parts.join(' ');
  };

  // Helper function to check if user experience falls within job's required range
  const parseExperienceRange = (experienceLevel: string | undefined): { min: number; max: number } | null => {
    if (!experienceLevel) return null;
    
    const text = experienceLevel.toLowerCase();
    
    // Match patterns like "3-5 years", "3 - 5 years", "3 to 5 years"
    const rangeMatch = text.match(/(\d+)\s*[-–—to]+\s*(\d+)/);
    if (rangeMatch) {
      return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
    }
    
    // Match patterns like "5+ years", "5 plus years", "minimum 5 years"
    const minMatch = text.match(/(\d+)\s*\+|minimum\s*(\d+)|at\s*least\s*(\d+)|(\d+)\s*(?:years?)?\s*(?:or\s*more|plus)/);
    if (minMatch) {
      const min = parseInt(minMatch[1] || minMatch[2] || minMatch[3] || minMatch[4]);
      return { min, max: 99 }; // No upper limit
    }
    
    // Match single number like "5 years experience"
    const singleMatch = text.match(/(\d+)\s*(?:years?|yrs?)/);
    if (singleMatch) {
      const years = parseInt(singleMatch[1]);
      // For single number, assume range of +/- 2 years
      return { min: Math.max(0, years - 2), max: years + 2 };
    }
    
    // Match level-based experience
    if (text.includes('entry') || text.includes('junior') || text.includes('fresher')) {
      return { min: 0, max: 2 };
    }
    if (text.includes('mid') || text.includes('intermediate')) {
      return { min: 2, max: 5 };
    }
    if (text.includes('senior') || text.includes('lead')) {
      return { min: 5, max: 99 };
    }
    if (text.includes('staff') || text.includes('principal') || text.includes('architect')) {
      return { min: 8, max: 99 };
    }
    
    return null;
  };

  // Filter jobs based on user's experience
  const filteredJobs = useMemo(() => {
    if (candidate.experience === undefined || candidate.experience === null) {
      return jobs; // No filter if experience not set
    }
    
    return jobs.filter(job => {
      const range = parseExperienceRange(job.experienceLevel);
      if (!range) return true; // Include jobs with unknown experience requirements
      
      // Check if user's experience falls within the job's required range
      return candidate.experience! >= range.min && candidate.experience! <= range.max;
    });
  }, [jobs, candidate.experience]);

  // Memoized eligible jobs for bulk apply (uses filtered jobs, excludes flagged)
  const eligibleJobsCount = useMemo(() => {
    return filteredJobs.filter(job => 
      job.recruiterEmail && 
      !appliedJobIds.has(job.id) &&
      !applyingJobIds.has(job.id) &&
      !applicationHistory.has(job.recruiterEmail.toLowerCase()) // Exclude flagged jobs from bulk
    ).length;
  }, [filteredJobs, appliedJobIds, applyingJobIds, applicationHistory]);

  // Check application history from database for a list of emails
  const checkApplicationHistory = useCallback(async (emails: string[]) => {
    if (emails.length === 0) return;
    
    try {
      const response = await fetch('/api/applications/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.history) {
          setApplicationHistory(new Map(Object.entries(data.history)));
        }
      }
    } catch (error) {
      console.error('Failed to check application history:', error);
    }
  }, []);

  // Fetch email status periodically
  const fetchEmailStatus = useCallback(async () => {
    setEmailStatusLoading(true);
    try {
      const response = await fetch('/api/email/status');
      if (response.ok) {
        const data = await response.json();
        setEmailStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch email status:', error);
    } finally {
      setEmailStatusLoading(false);
    }
  }, []);

  // Fetch saved prompt from database
  const fetchSavedPrompt = useCallback(async () => {
    try {
      const response = await fetch('/api/prompts?name=job_parser');
      if (response.ok) {
        const data = await response.json();
        if (data.prompt) {
          setSavedPrompt(data.prompt);
          setSavedPromptUpdatedAt(data.updatedAt || '');
        }
      }
    } catch (error) {
      console.error('Failed to fetch saved prompt:', error);
    }
  }, []);

  // Save prompt to database
  const handleSavePrompt = async () => {
    setSavingPrompt(true);
    try {
      const response = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'job_parser', prompt: savedPrompt }),
      });
      if (response.ok) {
        const data = await response.json();
        setSavedPromptUpdatedAt(data.updatedAt);
      }
    } catch (error) {
      console.error('Failed to save prompt:', error);
    } finally {
      setSavingPrompt(false);
    }
  };

  // Fetch email status on mount and every 30 seconds
  useEffect(() => {
    fetchEmailStatus();
    fetchSavedPrompt();
    const interval = setInterval(fetchEmailStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchEmailStatus, fetchSavedPrompt]);

  // Open email preview modal and generate email content
  const handleApplyToJob = async (job: Job, forceApply: boolean = false) => {
    if (!job.recruiterEmail) {
      return;
    }

    if (!candidate.name) {
      return;
    }

    if (!resumeFile) {
      return;
    }

    // Use the local template with job-specific variables
    const filled = fillTemplate(emailTemplate, {
      company: job.company || 'your company',
      position: job.jobTitle,
      your_name: candidate.name,
      email: candidate.email,
      phone: candidate.phone,
      experience: candidate.experience ?? '',
      notice_period: candidate.noticePeriod ?? '',
    });

    // Open preview modal with pre-filled template
    setEmailPreview({
      job,
      subject: filled.subject,
      body: filled.body,
      forceApply,
      generating: false,
    });
  };

  // Actually queue the email after user confirms/edits
  const handleConfirmSendEmail = async () => {
    if (!emailPreview) return;

    const { job, subject, body, forceApply } = emailPreview;
    setEmailPreview(null);
    
    await sendEmailToJob(job, job.recruiterEmail || '', subject, body, forceApply);
  };

  // Direct send function - can be called with any job and email content
  const sendEmailToJob = async (job: Job, recipientEmail: string, subject: string, body: string, forceApply: boolean = false) => {
    setApplyingJobIds(prev => new Set(prev).add(job.id));

    try {
      const response = await fetch('/api/email/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recruiterEmail: recipientEmail, // Use the editable recipient email
          recruiterName: job.recruiterName || 'Hiring Manager',
          jobTitle: job.jobTitle,
          company: job.company || 'your company',
          jobDescription: job.jobDescription,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          skills: [],
          forceApply,
          // Pass custom subject/body so the queue uses these instead of regenerating
          customSubject: subject,
          customBody: body,
          // Resume attachment
          resumeAttachment: resumeBase64 ? {
            filename: resumeFile?.name || 'resume.pdf',
            content: resumeBase64,
          } : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.isDuplicate || result.status === 'duplicate') {
          // Refresh application history from database
          if (recipientEmail) {
            await checkApplicationHistory([recipientEmail]);
          }
        }
        // Failed emails stay without marking
        console.error('Email send failed:', result.error || result.status);
        return;
      }

      // Only mark as applied if actually sent
      if (result.status === 'sent') {
        setAppliedJobIds(prev => new Set(prev).add(job.id));
        // Also add to local history for immediate UI update
        if (recipientEmail) {
          setApplicationHistory(prev => new Map(prev).set(recipientEmail.toLowerCase(), {
            appliedAt: new Date().toISOString(),
            jobTitle: job.jobTitle,
            company: job.company || '',
            status: 'sent',
          }));
        }
      }
      await fetchEmailStatus();
    } catch (error) {
      console.error('Failed to send:', error);
    } finally {
      setApplyingJobIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(job.id);
        return newSet;
      });
    }
  };

  // Bulk apply to all relevant jobs with recruiter emails (excludes flagged jobs)
  // Sends emails one by one with real-time progress updates
  const handleBulkApply = async () => {
    const eligibleJobs = jobs.filter(job => 
      job.recruiterEmail && 
      !appliedJobIds.has(job.id) &&
      !applyingJobIds.has(job.id) &&
      !applicationHistory.has(job.recruiterEmail.toLowerCase()) // Exclude flagged jobs
    );

    if (eligibleJobs.length === 0) {
      return;
    }

    // Initialize progress tracking
    setBulkApplyProgress({
      isRunning: true,
      total: eligibleJobs.length,
      current: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      currentEmail: '',
      currentCompany: '',
    });

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    try {
      // Send emails one by one for real-time progress
      for (let i = 0; i < eligibleJobs.length; i++) {
        const job = eligibleJobs[i];
        
        // Update progress before sending
        setBulkApplyProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          currentEmail: job.recruiterEmail || '',
          currentCompany: job.company || job.jobTitle,
        } : null);

        // Fill template for this job
        const filled = fillTemplate(emailTemplate, {
          company: job.company || 'your company',
          position: job.jobTitle,
          your_name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          experience: candidate.experience ?? '',
          notice_period: candidate.noticePeriod ?? '',
        });

        try {
          const response = await fetch('/api/email/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recruiterEmail: job.recruiterEmail,
              recruiterName: job.recruiterName || 'Hiring Manager',
              jobTitle: job.jobTitle,
              company: job.company || 'your company',
              jobDescription: job.jobDescription,
              candidateName: candidate.name,
              candidateEmail: candidate.email,
              skills: [],
              customSubject: filled.subject,
              customBody: filled.body,
              resumeAttachment: resumeBase64 ? {
                filename: resumeFile?.name || 'resume.pdf',
                content: resumeBase64,
              } : undefined,
            }),
          });

          const result = await response.json();

          if (response.ok && result.status === 'sent') {
            sentCount++;
            // Immediately update UI to show this job as applied
            setAppliedJobIds(prev => new Set(prev).add(job.id));
            // Add to local application history
            if (job.recruiterEmail) {
              setApplicationHistory(prev => new Map(prev).set(job.recruiterEmail!.toLowerCase(), {
                appliedAt: new Date().toISOString(),
                jobTitle: job.jobTitle,
                company: job.company || '',
                status: 'sent',
              }));
            }
          } else if (result.status === 'duplicate' || result.isDuplicate) {
            skippedCount++;
            // Update application history for duplicate
            if (job.recruiterEmail) {
              await checkApplicationHistory([job.recruiterEmail]);
            }
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`Failed to send to ${job.recruiterEmail}:`, error);
          failedCount++;
        }

        // Update progress after each email
        setBulkApplyProgress(prev => prev ? {
          ...prev,
          sent: sentCount,
          failed: failedCount,
          skipped: skippedCount,
        } : null);

        // Small delay between emails to avoid rate limiting
        if (i < eligibleJobs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Refresh email status after all emails are sent
      await fetchEmailStatus();
    } catch (error) {
      console.error('Bulk send failed:', error);
    } finally {
      // Keep modal open to show final results, but mark as not running
      setBulkApplyProgress(prev => prev ? { ...prev, isRunning: false } : null);
    }
  };

  // Get account availability info
  const getAccountAvailability = () => {
    if (!emailStatus?.accounts?.accounts) return { available: 0, total: 0, percent: 0 };
    const available = emailStatus.accounts.totalAutoSendRemaining;
    const total = emailStatus.accounts.accounts.reduce((sum, acc) => sum + acc.autoSendLimit, 0);
    return { available, total, percent: total > 0 ? Math.round((available / total) * 100) : 0 };
  };

  // Handle resume file upload (for email attachment only)
  const handleResumeUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResumeFile(file);

    try {
      // Read file as base64 for attachment
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]; // Remove data:... prefix
        setResumeBase64(base64);
      };
      reader.onerror = () => {
        console.error('Failed to read resume file');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Resume upload failed:', error);
    }
  };

  // Handle parsing jobs from pasted text (JSON array from Job Curator)
  const handleParseJobText = async () => {
    if (!jobTextInput.trim()) {
      return;
    }

    setParsingJobText(true);

    try {
      const response = await fetch("/api/extract-jobs-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: jobTextInput }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to parse text: ${response.status}`);
      }

      const data = await response.json();

      if (data.message && data.jobs?.length === 0) {
        setParsingJobText(false);
        return;
      }

      const extractedJobs = data.jobs || [];

      // Add all jobs to the list
      const newJobs: Job[] = extractedJobs.map((jobData: Record<string, unknown>) => ({
        id: Math.random().toString(),
        jobTitle: (jobData.jobTitle as string) || "Unknown Position",
        recruiterEmail: (jobData.recruiterEmail as string) || "",
        recruiterPhone: (jobData.recruiterPhone as string) || "",
        recruiterName: (jobData.recruiterName as string) || "Unknown",
        company: (jobData.company as string) || "",
        location: (jobData.location as string) || "",
        workType: (jobData.workType as string) || "unknown",
        experienceLevel: (jobData.experienceLevel as string) || "",
        salaryRange: (jobData.salaryRange as string) || "",
        skills: (jobData.skills as string[]) || [],
        jobType: (jobData.jobType as string) || "unknown",
        status: "idle" as const,
        jobDescription: (jobData.jobDescription as string) || ""
      }));

      setJobs(prev => [...prev, ...newJobs]);

      // Check application history for all HR emails from database
      const hrEmails = newJobs
        .map(job => job.recruiterEmail)
        .filter((email): email is string => !!email);
      if (hrEmails.length > 0) {
        await checkApplicationHistory(hrEmails);
      }

      // Close modal and clear input
      setShowJobTextModal(false);
      setJobTextInput("");

    } catch (error) {
      console.error('Failed to parse job text:', error);
    } finally {
      setParsingJobText(false);
    }
  };

  return (
    <div className={cn(
      "h-screen w-screen bg-[#050505] text-[#EDEDED] font-sans flex overflow-hidden selection:bg-[#333]",
      bulkApplyProgress?.isRunning && "pointer-events-none"
    )}>
      
      {/* Overlay when bulk apply is running - blocks all interaction */}
      {bulkApplyProgress?.isRunning && (
        <div className="fixed inset-0 bg-black/50 z-40 pointer-events-none" />
      )}
      
      {/* 1. Sidebar: Config (Fixed width) */}
      <div className="w-75 border-r border-[#1F1F1F] flex flex-col bg-[#080808]">
        <div className="h-12 border-b border-[#1F1F1F] flex items-center px-4 shrink-0">
          <div className="w-4 h-4 bg-[#EDEDED] rounded-sm mr-3 flex items-center justify-center">
            <div className="w-2 h-2 bg-black rounded-[1px]" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-[#EDEDED]">AutoApply</span>
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-[#2F2F2F] text-[#525252] font-mono">V3</span>
        </div>

        <div className="p-4 space-y-6 flex-1 overflow-auto">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-[#525252] uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4" /> Profile
            </h3>
            <div className="space-y-4 pl-1">
              <Input label="Full Name" value={candidate.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setCandidate({ ...candidate, name: e.target.value })} placeholder="Alex Doe" />
              <Input label="Email" value={candidate.email} onChange={(e: ChangeEvent<HTMLInputElement>) => setCandidate({ ...candidate, email: e.target.value })} placeholder="alex@work.com" />
              <Input label="Phone" value={candidate.phone} onChange={(e: ChangeEvent<HTMLInputElement>) => setCandidate({ ...candidate, phone: e.target.value })} placeholder="+91 9564607487" />
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-semibold text-[#525252] tracking-wider ml-0.5">Experience</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0" 
                    max="50"
                    value={candidate.experience !== undefined ? Math.floor(candidate.experience) : ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const yrs = e.target.value === '' ? undefined : parseInt(e.target.value);
                      const mos = experienceMonths ?? 0;
                      const total = yrs !== undefined ? yrs + mos / 12 : undefined;
                      setCandidate({ ...candidate, experience: total });
                      if (yrs === undefined) setExperienceMonths(undefined);
                    }}
                    placeholder="4"
                    className="w-16 h-10 px-3 text-sm bg-[#0A0A0A] border border-[#1F1F1F] rounded focus:border-[#525252] focus:bg-[#0F0F0F] transition-colors text-center"
                  />
                  <span className="text-xs text-[#525252]">yr</span>
                  <input 
                    type="number" 
                    min="0" 
                    max="11"
                    value={experienceMonths ?? ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const mos = e.target.value === '' ? undefined : Math.min(11, parseInt(e.target.value));
                      setExperienceMonths(mos);
                      const yrs = candidate.experience !== undefined ? Math.floor(candidate.experience) : 0;
                      const total = (yrs + (mos ?? 0) / 12);
                      setCandidate({ ...candidate, experience: (yrs === 0 && mos === undefined) ? undefined : total });
                    }}
                    placeholder="0"
                    className="w-16 h-10 px-3 text-sm bg-[#0A0A0A] border border-[#1F1F1F] rounded focus:border-[#525252] focus:bg-[#0F0F0F] transition-colors text-center"
                  />
                  <span className="text-xs text-[#525252]">mo</span>
                  {candidate.experience !== undefined && (
                    <span className="text-[10px] text-[#2E8B57] ml-auto">
                      Filtering
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-semibold text-[#525252] tracking-wider ml-0.5">Notice Period</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0" 
                    max="180"
                    value={candidate.noticePeriod ?? ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      setCandidate({ ...candidate, noticePeriod: val === '' ? undefined : parseInt(val) });
                    }}
                    placeholder="30"
                    className="w-20 h-10 px-3 text-sm bg-[#0A0A0A] border border-[#1F1F1F] rounded focus:border-[#525252] focus:bg-[#0F0F0F] transition-colors text-center"
                  />
                  <span className="text-xs text-[#525252]">days</span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
             <h3 className="text-xs font-semibold text-[#525252] uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> Resume
            </h3>
            
            {/* Resume File Upload */}
            <label className="block group cursor-pointer">
              <input 
                type="file" 
                className="hidden" 
                accept=".pdf,.doc,.docx,.txt" 
                onChange={handleResumeUpload} 
              />
              <div className={cn(
                "min-h-20 border border-dashed rounded bg-[#0A0A0A] flex flex-col items-center justify-center transition-all p-4",
                resumeFile ? "border-[#2E8B57]/30 bg-[#2E8B57]/5" : "border-[#2F2F2F] group-hover:border-[#525252]"
              )}>
                {resumeFile ? (
                  <div className="text-center w-full">
                    <CheckCircle2 className="w-5 h-5 text-[#2E8B57] mx-auto mb-1" />
                    <p className="text-xs text-[#2E8B57] font-medium truncate max-w-full">{resumeFile.name}</p>
                    <p className="text-[10px] text-[#525252] mt-0.5">{Math.round(resumeFile.size / 1024)}KB • Ready to attach</p>
                  </div>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-[#525252] mb-1 group-hover:text-[#A1A1A1]" />
                    <p className="text-xs text-[#525252] group-hover:text-[#A1A1A1]">Upload Resume (PDF/DOC)</p>
                  </>
                )}
              </div>
            </label>
          </section>

          {/* Email Template Preview */}
          <section className="space-y-3">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setTemplateExpanded(!templateExpanded)}
            >
              <h3 className="text-xs font-semibold text-[#525252] uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-4 h-4" /> Email Template
                {!templateStatus.isComplete && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-[#D4AF37]/20 text-[#D4AF37] rounded">
                    {templateStatus.issues.length} issue{templateStatus.issues.length > 1 ? 's' : ''}
                  </span>
                )}
              </h3>
              <svg className={cn("w-4 h-4 text-[#525252] transition-transform", templateExpanded && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {templateExpanded && (
              <div className="space-y-4">
                {/* Status Indicator */}
                <div className={cn(
                  "p-2.5 rounded border text-xs",
                  templateStatus.isComplete 
                    ? "bg-[#2E8B57]/10 border-[#2E8B57]/30 text-[#2E8B57]"
                    : "bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37]"
                )}>
                  {templateStatus.isComplete ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Template ready to send
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {templateStatus.issues.join(', ')}
                    </span>
                  )}
                </div>

                {/* Subject Preview */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase font-semibold text-[#525252] tracking-wider flex items-center gap-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={emailTemplate.subject}
                    onChange={(e) => setEmailTemplate(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full h-9 px-3 text-xs bg-[#0A0A0A] border border-[#1F1F1F] rounded focus:border-[#525252] focus:bg-[#0F0F0F] transition-colors"
                  />
                  <div className="text-[10px] text-[#A1A1A1] bg-[#0A0A0A] p-2 rounded border border-[#1F1F1F]">
                    <span className="text-[#525252]">Preview: </span>
                    {filledTemplate.subject}
                  </div>
                </div>

                {/* Body Preview */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase font-semibold text-[#525252] tracking-wider">
                    Body
                  </label>
                  <div className="text-[9px] text-[#A1A1A1] -mt-1 mb-1">
                    Variables: {"{{company}}"} {"{{position}}"} {"{{your_name}}"} {"{{email}}"} {"{{phone}}"}
                  </div>
                  <textarea
                    value={emailTemplate.body}
                    onChange={(e) => setEmailTemplate(prev => ({ ...prev, body: e.target.value }))}
                    rows={10}
                    className="w-full px-3 py-2 text-xs bg-[#0A0A0A] border border-[#1F1F1F] rounded focus:border-[#525252] focus:bg-[#0F0F0F] transition-colors resize-none font-mono leading-relaxed"
                  />
                </div>

                {/* Live Preview */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase font-semibold text-[#2E8B57] tracking-wider flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> Live Preview
                  </label>
                  <div className="text-xs text-[#A1A1A1] bg-[#0A0A0A] p-3 rounded border border-[#2E8B57]/30 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                    {filledTemplate.body}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Email Queue Status */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-3 h-3" /> Email Status
              <button onClick={fetchEmailStatus} disabled={emailStatusLoading} className="ml-auto">
                <RefreshCw className={cn("w-3 h-3 text-[#525252] hover:text-[#A1A1A1]", emailStatusLoading && "animate-spin")} />
              </button>
            </h3>
            {emailStatus ? (
              <div className="space-y-2 text-[10px]">
                {/* Email Stats - Sent/Failed only */}
                <div className="grid grid-cols-2 gap-1">
                  <div className="p-2 bg-[#0A0A0A] border border-[#1F1F1F] rounded text-center">
                    <div className="text-[#2E8B57] font-bold">{emailStatus.queue.sent}</div>
                    <div className="text-[#525252]">Sent</div>
                  </div>
                  <div className="p-2 bg-[#0A0A0A] border border-[#1F1F1F] rounded text-center">
                    <div className="text-[#B22222] font-bold">{emailStatus.queue.failed}</div>
                    <div className="text-[#525252]">Failed</div>
                  </div>
                </div>
                
                {/* Clear History Button (for dev/testing) */}
                {(emailStatus.queue.sent > 0 || emailStatus.queue.failed > 0) && (
                  <button
                    onClick={async () => {
                      if (!confirm('Clear all application history? This allows re-sending to same emails.')) return;
                      try {
                        const res = await fetch('/api/applications/clear', { method: 'POST' });
                        if (res.ok) {
                          await fetchEmailStatus();
                          setAppliedJobIds(new Set());
                          setApplicationHistory(new Map());
                        }
                      } catch (err) {
                        console.error('Failed to clear:', err);
                      }
                    }}
                    className="w-full py-1 px-2 text-[9px] text-[#525252] hover:text-[#A1A1A1] border border-[#1F1F1F] rounded hover:bg-[#1F1F1F]/50 transition-colors"
                  >
                    🗑️ Clear History (Dev)
                  </button>
                )}
                
                {/* Account Status */}
                <div className="space-y-1.5">
                  <div className="text-[9px] text-[#525252] uppercase font-semibold mb-1">Email Accounts</div>
                  {emailStatus.accounts.allAccounts?.map((acc) => {
                    // Find stats for active accounts
                    const stats = emailStatus.accounts.accounts.find(a => a.id === acc.id);
                    const percent = stats && stats.autoSendLimit > 0 ? (stats.sentToday / stats.autoSendLimit) * 100 : 0;
                    
                    return (
                      <div key={acc.id} className={cn(
                        "p-2 bg-[#0A0A0A] border rounded transition-all",
                        acc.isActive ? "border-[#2E8B57]/30" : "border-[#1F1F1F] opacity-60"
                      )}>
                        <div className="flex justify-between items-center mb-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={acc.isActive}
                              onChange={async (e) => {
                                try {
                                  const res = await fetch('/api/email/accounts/toggle', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ accountId: acc.id, isActive: e.target.checked }),
                                  });
                                  if (res.ok) {
                                    await fetchEmailStatus();
                                  }
                                } catch (err) {
                                  console.error('Failed to toggle account:', err);
                                }
                              }}
                              className="w-3 h-3 rounded border-[#525252] bg-[#0A0A0A] accent-[#2E8B57]"
                            />
                            <span className={cn(
                              "text-[10px] truncate max-w-[100px]",
                              acc.isActive ? "text-[#A1A1A1]" : "text-[#525252]"
                            )}>
                              {acc.email.split('@')[0]}
                            </span>
                          </label>
                          {stats && (
                            <span className={cn(
                              "font-mono text-[10px]",
                              percent >= 100 ? "text-[#B22222]" : percent >= 80 ? "text-[#D4AF37]" : "text-[#2E8B57]"
                            )}>
                              {stats.sentToday}/{stats.autoSendLimit}
                            </span>
                          )}
                        </div>
                        {stats && (
                          <>
                            <div className="w-full h-1 bg-[#1F1F1F] rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full transition-all",
                                  percent >= 100 ? "bg-[#B22222]" : percent >= 80 ? "bg-[#D4AF37]" : "bg-[#2E8B57]"
                                )}
                                style={{ width: `${Math.min(100, percent)}%` }}
                              />
                            </div>
                            <div className="text-[8px] text-[#525252] mt-1">
                              +{stats.replyReserve} reserved for replies
                            </div>
                          </>
                        )}
                        {!acc.isActive && (
                          <div className="text-[8px] text-[#525252] mt-1">
                            Disabled - check to enable
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Availability Summary */}
                {(() => {
                  const { available, total, percent } = getAccountAvailability();
                  return (
                    <div className={cn(
                      "p-2 rounded border text-center",
                      percent > 50 ? "bg-[#2E8B57]/10 border-[#2E8B57]/30 text-[#2E8B57]" :
                      percent > 0 ? "bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37]" :
                      "bg-[#B22222]/10 border-[#B22222]/30 text-[#B22222]"
                    )}>
                      <span className="font-bold">{available}</span> emails available today
                    </div>
                  );
                })()}

                {/* Saved Prompt Backup */}
                <div className="border-t border-[#1F1F1F] pt-3 mt-3">
                  <button
                    onClick={() => setPromptExpanded(!promptExpanded)}
                    className="w-full flex justify-between items-center text-[9px] text-[#525252] uppercase font-semibold mb-2 hover:text-[#A1A1A1]"
                  >
                    <span>📋 Saved Prompt</span>
                    <span>{promptExpanded ? '▲' : '▼'}</span>
                  </button>
                  
                  {promptExpanded && (
                    <div className="space-y-2">
                      <textarea
                        value={savedPrompt}
                        onChange={(e) => setSavedPrompt(e.target.value)}
                        placeholder="No prompt saved. Paste your AI prompt here to backup..."
                        rows={8}
                        className="w-full p-2 text-[10px] bg-[#0A0A0A] border border-[#1F1F1F] rounded focus:border-[#525252] resize-none font-mono text-[#A1A1A1]"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSavePrompt}
                          disabled={savingPrompt}
                          className="flex-1 py-1.5 px-2 text-[9px] bg-[#2E8B57]/20 text-[#2E8B57] border border-[#2E8B57]/30 rounded hover:bg-[#2E8B57]/30 disabled:opacity-50"
                        >
                          {savingPrompt ? 'Saving...' : '💾 Update'}
                        </button>
                        <button
                          onClick={fetchSavedPrompt}
                          className="flex-1 py-1.5 px-2 text-[9px] bg-[#1F1F1F] text-[#A1A1A1] border border-[#1F1F1F] rounded hover:bg-[#2F2F2F]"
                        >
                          🔄 Restore
                        </button>
                      </div>
                      {savedPromptUpdatedAt && (
                        <div className="text-[8px] text-[#525252] text-center">
                          Last saved: {new Date(savedPromptUpdatedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-[#525252] text-center py-4">
                {emailStatusLoading ? "Loading..." : "No status available"}
              </div>
            )}
          </section>
        </div>

        <div className="p-4 border-t border-[#1F1F1F] space-y-2">
           <Button 
             className="w-full" 
             variant="outline"
             icon={<Send className="w-3 h-3" />} 
             onClick={handleBulkApply}
             disabled={!candidate.name || !resumeFile || eligibleJobsCount === 0 || bulkApplyProgress?.isRunning}
             loading={bulkApplyProgress?.isRunning}
           >
             {bulkApplyProgress?.isRunning ? `Sending... (${bulkApplyProgress.current}/${bulkApplyProgress.total})` : `Bulk Apply (${eligibleJobsCount})`}
           </Button>
        </div>
      </div>

      {/* 2. Main Stage: Job Pipeline */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#050505]">
        <div className="h-14 border-b border-[#1F1F1F] flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-medium">Jobs</h2>
            <div className="h-4 w-px bg-[#1F1F1F]" />
            <div className="flex items-center gap-2 text-xs text-[#525252]">
              {candidate.experience !== undefined ? (
                <>
                  <span className="text-[#2E8B57] font-medium">{filteredJobs.length}</span> 
                  <span>of {jobs.length} match</span>
                  <span className="text-[#D4AF37]">({formatExperience(candidate.experience !== undefined ? Math.floor(candidate.experience) : undefined, experienceMonths)})</span>
                </>
              ) : (
                <>
                  <span className="text-[#2E8B57] font-medium">{jobs.length}</span> Total
                </>
              )}
            </div>
          </div>
          
          {/* Add Jobs - Paste JSON */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowJobTextModal(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[#2F2F2F] text-[#A1A1A1] hover:text-[#EDEDED] hover:border-[#525252] transition-colors"
            >
              <FileText className="w-3 h-3" /> Paste JSON
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-auto">
          {filteredJobs.length === 0 && jobs.length === 0 ? (
            <div 
              onClick={() => setShowJobTextModal(true)}
              className="h-48 border border-dashed border-[#1F1F1F] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-[#0A0A0A] transition-colors group"
            >
              <div className="w-10 h-10 bg-[#0F0F0F] rounded-full flex items-center justify-center mb-3 border border-[#1F1F1F] group-hover:border-[#333] transition-colors">
                <LayoutDashboard className="w-4 h-4 text-[#525252] group-hover:text-[#EDEDED]" />
              </div>
              <h3 className="text-sm font-medium text-[#A1A1A1] group-hover:text-[#EDEDED]">
                Paste Job JSON
              </h3>
              <p className="text-xs text-[#525252] mt-1">
                Click to paste job data from Job Curator
              </p>
            </div>
          ) : filteredJobs.length === 0 && jobs.length > 0 ? (
            <div className="h-48 border border-dashed border-[#D4AF37]/30 rounded-lg flex flex-col items-center justify-center bg-[#D4AF37]/5">
              <AlertCircle className="w-8 h-8 text-[#D4AF37] mb-3" />
              <h3 className="text-sm font-medium text-[#D4AF37]">
                No jobs match your experience
              </h3>
              <p className="text-xs text-[#525252] mt-1">
                {jobs.length} job{jobs.length > 1 ? 's' : ''} hidden • Clear experience filter to see all
              </p>
              <button 
                onClick={() => setCandidate({ ...candidate, experience: undefined })}
                className="mt-3 text-xs px-3 py-1 border border-[#D4AF37]/30 rounded text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
              >
                Clear Filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredJobs.map((job) => (
                <div key={job.id} className="group p-4 bg-[#0A0A0A] border rounded-md transition-all hover:shadow-sm relative border-[#1F1F1F] hover:border-[#333]">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-sm font-medium text-[#EDEDED]">{job.jobTitle || "Untitled Position"}</h4>
                    <button onClick={() => setJobs(j => j.filter(x => x.id !== job.id))} className="text-[#333] hover:text-[#B22222] transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#A1A1A1] mb-1">
                    <User className="w-3 h-3" /> {job.recruiterName || "Unknown"}
                    {job.company && <span className="text-[#525252]">• {job.company}</span>}
                  </div>
                  
                  {/* Work type and experience */}
                  {(job.workType || job.experienceLevel) && (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#A1A1A1] mb-2">
                      {job.workType && job.workType !== 'unknown' && <span className="px-1.5 py-0.5 bg-[#1F1F1F] rounded">{job.workType}</span>}
                      {job.experienceLevel && <span className="px-1.5 py-0.5 bg-[#1F1F1F] rounded">{job.experienceLevel}</span>}
                    </div>
                  )}
                  
                  {/* Contact Info - IMPORTANT */}
                  {(job.recruiterEmail || job.recruiterPhone) ? (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#2E8B57] mb-2 bg-[#2E8B57]/10 px-2 py-1 rounded border border-[#2E8B57]/20">
                      {job.recruiterEmail && <span>📧 {job.recruiterEmail}</span>}
                      {job.recruiterPhone && <span>📱 {job.recruiterPhone}</span>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] text-[#525252] mb-2 bg-[#1A1A1A] px-2 py-1 rounded border border-[#2F2F2F]">
                      <span>No email — cannot auto-apply</span>
                    </div>
                  )}
                  
                  {/* Skills preview */}
                  {job.skills && job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {job.skills.slice(0, 4).map((skill, i) => (
                        <span key={i} className="text-[8px] px-1.5 py-0.5 bg-[#1F1F1F] border border-[#2F2F2F] rounded text-[#A1A1A1]">
                          {skill}
                        </span>
                      ))}
                      {job.skills.length > 4 && (
                        <span className="text-[8px] px-1.5 py-0.5 text-[#525252]">+{job.skills.length - 4}</span>
                      )}
                    </div>
                  )}
                  
                  {job.errorMessage && (
                    <p className="text-[10px] text-[#B22222] mb-3">{job.errorMessage}</p>
                  )}
                  
                  {/* Application Status Badges */}
                  {appliedJobIds.has(job.id) && (
                    <div className="flex items-center gap-1 mb-2 text-[9px] px-2 py-1 bg-[#2E8B57]/10 border border-[#2E8B57]/20 rounded text-[#2E8B57]">
                      <CheckCheck className="w-3 h-3" /> Email Sent
                    </div>
                  )}
                  
                  {/* Flagged: Previously contacted this HR (from database) */}
                  {job.recruiterEmail && applicationHistory.has(job.recruiterEmail.toLowerCase()) && !appliedJobIds.has(job.id) && (() => {
                    const history = applicationHistory.get(job.recruiterEmail.toLowerCase())!;
                    const appliedDate = new Date(history.appliedAt).toLocaleDateString();
                    return (
                      <div className="mb-2 text-[9px] px-2 py-1.5 bg-[#D4AF37]/10 border border-[#D4AF37]/20 rounded">
                        <div className="flex items-center justify-between">
                          <span className="text-[#D4AF37] flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Previously contacted
                          </span>
                          <button 
                            onClick={() => handleApplyToJob(job, true)}
                            className="text-[8px] px-1.5 py-0.5 bg-[#D4AF37]/20 rounded hover:bg-[#D4AF37]/30 text-[#D4AF37]"
                          >
                            Apply Anyway
                          </button>
                        </div>
                        <div className="text-[8px] text-[#A1A1A1] mt-1">
                          {appliedDate} • {history.jobTitle}{history.company ? ` at ${history.company}` : ''}
                        </div>
                      </div>
                    );
                  })()}
                  
                  <div className="flex items-center justify-between pt-3 border-t border-[#1F1F1F]">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#525252]">
                      {job.recruiterEmail && applicationHistory.has(job.recruiterEmail.toLowerCase()) ? 'flagged' : 'ready'}
                    </span>
                    <div className="flex gap-1">
                      {job.recruiterEmail && !appliedJobIds.has(job.id) && !applicationHistory.has(job.recruiterEmail.toLowerCase()) && (
                        <Button 
                          variant="ghost" 
                          size="xs" 
                          icon={applyingJobIds.has(job.id) ? <Clock className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} 
                          onClick={() => handleApplyToJob(job)}
                          disabled={applyingJobIds.has(job.id)}
                        >
                          Apply
                        </Button>
                      )}
                      <Button variant="ghost" size="xs" icon={<Eye className="w-3 h-3" />} onClick={() => setPreviewJob(job)}>Preview</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>



      {/* Preview Modal */}
      {previewJob && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8" onClick={() => setPreviewJob(null)}>
          <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="h-12 px-4 border-b border-[#1F1F1F] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[#EDEDED]">{previewJob.jobTitle}</span>
                {previewJob.matchScore !== undefined && (
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded",
                    previewJob.matchScore >= 70 ? "bg-[#2E8B57]/20 text-[#2E8B57]" :
                    previewJob.matchScore >= 40 ? "bg-[#D4AF37]/20 text-[#D4AF37]" : "bg-[#B22222]/20 text-[#B22222]"
                  )}>{previewJob.matchScore}% Match</span>
                )}
              </div>
              <button onClick={() => setPreviewJob(null)} className="text-[#525252] hover:text-[#EDEDED]"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-4 overflow-auto flex-1 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] uppercase font-semibold text-[#525252] mb-1">Recruiter</h4>
                  <p className="text-sm text-[#EDEDED]">{previewJob.recruiterName || "Unknown"}</p>
                  {previewJob.recruiterEmail && <p className="text-xs text-[#A1A1A1]">📧 {previewJob.recruiterEmail}</p>}
                  {previewJob.recruiterPhone && <p className="text-xs text-[#A1A1A1]">📱 {previewJob.recruiterPhone}</p>}
                </div>
                {previewJob.company && (
                  <div>
                    <h4 className="text-[10px] uppercase font-semibold text-[#525252] mb-1">Company</h4>
                    <p className="text-sm text-[#EDEDED]">{previewJob.company}</p>
                    {previewJob.location && <p className="text-xs text-[#A1A1A1]">{previewJob.location}</p>}
                  </div>
                )}
              </div>
              
              {/* Contact Info Highlight - VERY IMPORTANT */}
              {(previewJob.recruiterEmail || previewJob.recruiterPhone) && (
                <div className="p-3 bg-[#2E8B57]/10 border border-[#2E8B57]/30 rounded">
                  <h4 className="text-[10px] uppercase font-semibold text-[#2E8B57] mb-2">📋 Contact Information</h4>
                  <div className="flex flex-wrap gap-4 text-sm text-[#EDEDED]">
                    {previewJob.recruiterEmail && (
                      <a href={`mailto:${previewJob.recruiterEmail}`} className="hover:text-[#2E8B57] transition-colors">
                        📧 {previewJob.recruiterEmail}
                      </a>
                    )}
                    {previewJob.recruiterPhone && (
                      <a href={`tel:${previewJob.recruiterPhone}`} className="hover:text-[#2E8B57] transition-colors">
                        📱 {previewJob.recruiterPhone}
                      </a>
                    )}
                  </div>
                </div>
              )}
              
              {/* AI Analysis */}
              {previewJob.aiAnalysis && (
                <div className="p-3 bg-[#0F0F0F] border border-[#1F1F1F] rounded">
                  <h4 className="text-[10px] uppercase font-semibold text-[#525252] mb-2 flex items-center gap-1">
                    <Brain className="w-3 h-3" /> AI Analysis
                  </h4>
                  <p className="text-sm text-[#A1A1A1]">{previewJob.aiAnalysis}</p>
                </div>
              )}
              
              {/* Skills Match */}
              {(previewJob.matchingSkills?.length || previewJob.missingSkills?.length) && (
                <div className="grid grid-cols-2 gap-4">
                  {previewJob.matchingSkills && previewJob.matchingSkills.length > 0 && (
                    <div>
                      <h4 className="text-[10px] uppercase font-semibold text-[#2E8B57] mb-2 flex items-center gap-1">
                        <Target className="w-3 h-3" /> Matching Skills ({previewJob.matchingSkills.length})
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {previewJob.matchingSkills.map((skill, i) => (
                          <span key={i} className="text-[10px] px-2 py-1 bg-[#2E8B57]/10 border border-[#2E8B57]/20 rounded text-[#2E8B57]">
                            ✓ {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {previewJob.missingSkills && previewJob.missingSkills.length > 0 && (
                    <div>
                      <h4 className="text-[10px] uppercase font-semibold text-[#B22222] mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Skills to Learn ({previewJob.missingSkills.length})
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {previewJob.missingSkills.map((skill, i) => (
                          <span key={i} className="text-[10px] px-2 py-1 bg-[#B22222]/10 border border-[#B22222]/20 rounded text-[#B22222]">
                            ✗ {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Experience Match */}
              {previewJob.experienceMatch && previewJob.experienceMatch !== 'unknown' && (
                <div>
                  <h4 className="text-[10px] uppercase font-semibold text-[#525252] mb-1">Experience Match</h4>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded",
                      previewJob.experienceMatch === 'strong' ? "bg-[#2E8B57]/20 text-[#2E8B57]" :
                      previewJob.experienceMatch === 'moderate' ? "bg-[#D4AF37]/20 text-[#D4AF37]" : "bg-[#B22222]/20 text-[#B22222]"
                    )}>{previewJob.experienceMatch.toUpperCase()}</span>
                    {previewJob.experienceNotes && <span className="text-xs text-[#A1A1A1]">{previewJob.experienceNotes}</span>}
                  </div>
                </div>
              )}
              
              {/* Recommendations */}
              {previewJob.recommendations && previewJob.recommendations.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase font-semibold text-[#D4AF37] mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Recommendations
                  </h4>
                  <ul className="space-y-1">
                    {previewJob.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-[#A1A1A1] flex items-start gap-2">
                        <span className="text-[#D4AF37]">→</span> {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Interview Tips */}
              {previewJob.interviewTips && previewJob.interviewTips.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase font-semibold text-[#6B8AE5] mb-2 flex items-center gap-1">
                    <Brain className="w-3 h-3" /> Interview Tips
                  </h4>
                  <ul className="space-y-1">
                    {previewJob.interviewTips.map((tip, i) => (
                      <li key={i} className="text-xs text-[#A1A1A1] flex items-start gap-2">
                        <span className="text-[#6B8AE5]">💡</span> {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Job Description */}
              <div>
                <h4 className="text-[10px] uppercase font-semibold text-[#525252] mb-1">Job Description</h4>
                <p className="text-xs text-[#A1A1A1] whitespace-pre-wrap max-h-32 overflow-auto bg-[#050505] p-3 rounded border border-[#1F1F1F]">{previewJob.jobDescription || "No description extracted"}</p>
              </div>

              {/* Email Preview/Edit Section */}
              {previewJobEmail && !appliedJobIds.has(previewJob.id) && (
                <div className="border-t border-[#1F1F1F] pt-4 space-y-3">
                  <h4 className="text-xs uppercase font-semibold text-[#2E8B57] flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email to Send
                  </h4>
                  
                  {/* Recipient Email */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-semibold text-[#525252]">To (Recipient Email)</label>
                    <input
                      type="email"
                      value={previewJobEmail.recipientEmail}
                      onChange={(e) => setPreviewJobEmail(prev => prev ? { ...prev, recipientEmail: e.target.value } : null)}
                      placeholder="recruiter@company.com"
                      className="w-full h-9 px-3 text-sm bg-[#050505] border border-[#1F1F1F] rounded focus:border-[#2E8B57] focus:bg-[#0A0A0A] transition-colors"
                    />
                  </div>
                  
                  {/* Subject */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-semibold text-[#525252]">Subject</label>
                    <input
                      type="text"
                      value={previewJobEmail.subject}
                      onChange={(e) => setPreviewJobEmail(prev => prev ? { ...prev, subject: e.target.value } : null)}
                      className="w-full h-9 px-3 text-sm bg-[#050505] border border-[#1F1F1F] rounded focus:border-[#2E8B57] focus:bg-[#0A0A0A] transition-colors"
                    />
                  </div>
                  
                  {/* Body */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-semibold text-[#525252]">Body</label>
                    <textarea
                      value={previewJobEmail.body}
                      onChange={(e) => setPreviewJobEmail(prev => prev ? { ...prev, body: e.target.value } : null)}
                      rows={8}
                      className="w-full px-3 py-2 text-sm bg-[#050505] border border-[#1F1F1F] rounded focus:border-[#2E8B57] focus:bg-[#0A0A0A] transition-colors resize-none font-mono leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-[#1F1F1F] flex gap-2 justify-end">
              {!appliedJobIds.has(previewJob.id) && previewJobEmail && (
                <>
                  {previewJob.recruiterEmail && applicationHistory.has(previewJob.recruiterEmail.toLowerCase()) ? (
                    <Button 
                      variant="outline"
                      icon={<AlertCircle className="w-3 h-3" />} 
                      onClick={() => { 
                        sendEmailToJob(previewJob, previewJobEmail.recipientEmail, previewJobEmail.subject, previewJobEmail.body, true);
                        setPreviewJob(null); 
                      }}
                      disabled={!previewJobEmail.recipientEmail}
                    >
                      Apply Anyway
                    </Button>
                  ) : (
                    <Button 
                      icon={applyingJobIds.has(previewJob.id) ? <Clock className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} 
                      onClick={() => { 
                        // Auto-force if user edited recipient to different email (for testing)
                        const isEditedRecipient = previewJobEmail.recipientEmail.toLowerCase() !== (previewJob.recruiterEmail || '').toLowerCase();
                        sendEmailToJob(previewJob, previewJobEmail.recipientEmail, previewJobEmail.subject, previewJobEmail.body, isEditedRecipient);
                        setPreviewJob(null);
                      }}
                      disabled={applyingJobIds.has(previewJob.id) || !candidate.name || !resumeFile || !previewJobEmail.recipientEmail}
                    >
                      {!previewJobEmail.recipientEmail ? 'Enter Email' : !candidate.name ? 'Enter Name' : !resumeFile ? 'Upload Resume' : 'Send Email'}
                    </Button>
                  )}
                </>
              )}
              {appliedJobIds.has(previewJob.id) && (
                <span className="flex items-center gap-1 text-xs text-[#2E8B57] px-3">
                  <CheckCheck className="w-4 h-4" /> Email Sent
                </span>
              )}
              <Button variant="outline" onClick={() => setPreviewJob(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Email Preview/Edit Modal */}
      {emailPreview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8" onClick={() => !emailPreview.generating && setEmailPreview(null)}>
          <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="h-12 px-4 border-b border-[#1F1F1F] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-[#2E8B57]" />
                <span className="text-sm font-semibold text-[#EDEDED]">
                  {emailPreview.generating ? 'Generating Email...' : 'Review & Edit Email'}
                </span>
              </div>
              <button 
                onClick={() => setEmailPreview(null)} 
                disabled={emailPreview.generating}
                className="text-[#525252] hover:text-[#EDEDED] disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {emailPreview.generating ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16">
                <Brain className="w-12 h-12 text-[#D4AF37] animate-pulse mb-4" />
                <p className="text-sm text-[#A1A1A1]">Generating personalized cover letter...</p>
                <p className="text-xs text-[#525252] mt-1">This may take a few seconds</p>
              </div>
            ) : (
              <>
                <div className="p-4 overflow-auto flex-1 space-y-4">
                  {/* Recipient Info */}
                  <div className="p-3 bg-[#0F0F0F] border border-[#1F1F1F] rounded">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[#525252]">To:</span>
                        <span className="text-[#EDEDED] ml-2">{emailPreview.job.recruiterEmail}</span>
                      </div>
                      <div>
                        <span className="text-[#525252]">Position:</span>
                        <span className="text-[#EDEDED] ml-2">{emailPreview.job.jobTitle}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Subject */}
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-[#525252] mb-1 block">Subject</label>
                    <input
                      type="text"
                      value={emailPreview.subject}
                      onChange={(e) => setEmailPreview(prev => prev ? { ...prev, subject: e.target.value } : null)}
                      className="w-full px-3 py-2 bg-[#0F0F0F] border border-[#2F2F2F] rounded text-sm text-[#EDEDED] focus:outline-none focus:border-[#525252]"
                    />
                  </div>
                  
                  {/* Body */}
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-semibold text-[#525252] mb-1 block">Email Body</label>
                    <textarea
                      value={emailPreview.body}
                      onChange={(e) => setEmailPreview(prev => prev ? { ...prev, body: e.target.value } : null)}
                      rows={16}
                      className="w-full px-3 py-2 bg-[#0F0F0F] border border-[#2F2F2F] rounded text-sm text-[#EDEDED] focus:outline-none focus:border-[#525252] resize-none font-mono leading-relaxed"
                    />
                  </div>
                  
                  {/* Character Count */}
                  <div className="flex justify-between text-[10px] text-[#525252]">
                    <span>{emailPreview.body.split(/\s+/).filter(Boolean).length} words</span>
                    <span>{emailPreview.body.length} characters</span>
                  </div>
                </div>
                
                <div className="p-4 border-t border-[#1F1F1F] flex gap-2 justify-between">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    icon={<RefreshCw className="w-3 h-3" />}
                    onClick={() => {
                      // Reset to template
                      const filled = fillTemplate(emailTemplate, {
                        company: emailPreview.job.company || 'your company',
                        position: emailPreview.job.jobTitle || '',
                        your_name: candidate.name || '',
                        email: candidate.email || '',
                        phone: candidate.phone || '',
                        experience: candidate.experience ?? '',
                        notice_period: candidate.noticePeriod ?? '',
                      });
                      setEmailPreview(prev => prev ? { ...prev, subject: filled.subject, body: filled.body } : null);
                    }}
                  >
                    Reset to Template
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEmailPreview(null)}>Cancel</Button>
                    <Button 
                      icon={<Send className="w-3 h-3" />}
                      onClick={handleConfirmSendEmail}
                      disabled={!emailPreview.subject.trim() || !emailPreview.body.trim()}
                    >
                      Send Email
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bulk Apply Progress Modal */}
      {bulkApplyProgress && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-8 pointer-events-auto">
          <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-lg max-w-md w-full overflow-hidden pointer-events-auto">
            <div className="h-12 px-4 border-b border-[#1F1F1F] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {bulkApplyProgress.isRunning ? (
                  <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
                ) : bulkApplyProgress.failed === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-[#2E8B57]" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#D4AF37]" />
                )}
                <span className="text-sm font-semibold text-[#EDEDED]">
                  {bulkApplyProgress.isRunning ? 'Sending Emails...' : 'Bulk Apply Complete'}
                </span>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-[#A1A1A1]">
                  <span>Progress</span>
                  <span className="font-mono">{bulkApplyProgress.current} / {bulkApplyProgress.total}</span>
                </div>
                <div className="w-full h-3 bg-[#1F1F1F] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#2E8B57] to-[#3CB371] transition-all duration-300"
                    style={{ width: `${(bulkApplyProgress.current / bulkApplyProgress.total) * 100}%` }}
                  />
                </div>
                <div className="text-center text-lg font-bold text-[#EDEDED]">
                  {bulkApplyProgress.total - bulkApplyProgress.current} remaining
                </div>
              </div>

              {/* Current Email Being Sent */}
              {bulkApplyProgress.isRunning && bulkApplyProgress.currentEmail && (
                <div className="p-3 bg-[#0F0F0F] border border-[#2F2F2F] rounded">
                  <div className="text-[10px] uppercase text-[#525252] mb-1">Currently Sending To</div>
                  <div className="text-sm text-[#EDEDED] truncate">{bulkApplyProgress.currentEmail}</div>
                  {bulkApplyProgress.currentCompany && (
                    <div className="text-xs text-[#A1A1A1] truncate">{bulkApplyProgress.currentCompany}</div>
                  )}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-[#2E8B57]/10 border border-[#2E8B57]/30 rounded text-center">
                  <div className="text-2xl font-bold text-[#2E8B57]">{bulkApplyProgress.sent}</div>
                  <div className="text-[10px] uppercase text-[#2E8B57]">Sent</div>
                </div>
                <div className="p-3 bg-[#B22222]/10 border border-[#B22222]/30 rounded text-center">
                  <div className="text-2xl font-bold text-[#B22222]">{bulkApplyProgress.failed}</div>
                  <div className="text-[10px] uppercase text-[#B22222]">Failed</div>
                </div>
                <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded text-center">
                  <div className="text-2xl font-bold text-[#D4AF37]">{bulkApplyProgress.skipped}</div>
                  <div className="text-[10px] uppercase text-[#D4AF37]">Skipped</div>
                </div>
              </div>

              {/* Warning Message */}
              {bulkApplyProgress.isRunning && (
                <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded text-center">
                  <div className="text-xs text-[#D4AF37] flex items-center justify-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Please wait. Do not close this window.
                  </div>
                </div>
              )}

              {/* Done Button */}
              {!bulkApplyProgress.isRunning && (
                <Button 
                  className="w-full" 
                  onClick={() => setBulkApplyProgress(null)}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Done
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Job Text Input Modal */}
      {showJobTextModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8" onClick={() => !parsingJobText && setShowJobTextModal(false)}>
          <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="h-12 px-4 border-b border-[#1F1F1F] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-sm font-semibold text-[#EDEDED]">Paste Job Postings</span>
              </div>
              <button 
                onClick={() => setShowJobTextModal(false)} 
                disabled={parsingJobText}
                className="text-[#525252] hover:text-[#EDEDED] disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-auto flex-1 space-y-4">
              {/* Instructions */}
              <div className="p-3 bg-[#0F0F0F] border border-[#1F1F1F] rounded">
                <h4 className="text-xs font-medium text-[#EDEDED] mb-2">📋 Paste Job Curator text or any job postings</h4>
                <p className="text-[11px] text-[#A1A1A1] leading-relaxed">
                  The AI will extract job details including: job titles, HR emails, experience requirements, skills, 
                  company names, and more. You can paste multiple job postings at once.
                </p>
                <div className="mt-2 text-[10px] text-[#525252]">
                  <span className="font-medium">Tip:</span> Paste the full Job Curator daily dump — jobs separated by ===== lines are automatically split and processed in batches.
                </div>
              </div>
              
              {/* Text Input */}
              <div className="flex-1">
                <label className="text-[10px] uppercase font-semibold text-[#525252] mb-1 block">Job Postings Text</label>
                <textarea
                  value={jobTextInput}
                  onChange={(e) => setJobTextInput(e.target.value)}
                  placeholder={`Paste your job postings here...

Example:
Position: Senior QA Engineer
Company: TechCorp Inc
Experience: 3-5 years
Skills: Selenium, Python, API Testing
Email: hr@techcorp.com
Phone: +1-234-567-8900

Hi, We have an opening for a QA Automation Engineer...`}
                  rows={16}
                  disabled={parsingJobText}
                  className="w-full px-3 py-2 bg-[#0F0F0F] border border-[#2F2F2F] rounded text-sm text-[#EDEDED] focus:outline-none focus:border-[#525252] resize-none font-mono leading-relaxed placeholder:text-[#333] disabled:opacity-50"
                />
              </div>
              
              {/* Character Count */}
              <div className="flex justify-between text-[10px] text-[#525252]">
                <span>{jobTextInput.length > 0 ? `${jobTextInput.split(/\s+/).filter(Boolean).length} words` : 'No text entered'}</span>
                <span>{jobTextInput.length} characters</span>
              </div>
            </div>
            
            <div className="p-4 border-t border-[#1F1F1F] flex gap-2 justify-between">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setJobTextInput("")}
                disabled={parsingJobText || !jobTextInput}
              >
                Clear
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowJobTextModal(false)} disabled={parsingJobText}>
                  Cancel
                </Button>
                <Button 
                  icon={parsingJobText ? <Clock className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  onClick={handleParseJobText}
                  disabled={parsingJobText || !jobTextInput.trim()}
                  loading={parsingJobText}
                >
                  {parsingJobText ? 'Parsing...' : 'Parse Jobs'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
