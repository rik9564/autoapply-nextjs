"use client";
import React, { useState, useEffect, ChangeEvent, useCallback, useMemo } from "react";
import { FileText, LayoutDashboard, FileUp, Loader2, SlidersHorizontal, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Job, EmailStatus } from "@/types";

// Layout & UI
import { Sidebar } from "@/components/layout/Sidebar";

// Job grid
import { JobCard, JobGridEmpty, JobGridFiltered } from "@/components/jobs/JobCard";

// Modals
import { JobPreviewModal } from "@/components/modals/JobPreviewModal";
import { EmailPreviewModal } from "@/components/modals/EmailPreviewModal";
import { BulkApplyModal, BulkApplyProgress } from "@/components/modals/BulkApplyModal";
import { JobTextModal } from "@/components/modals/JobTextModal";

export default function Page() {
  const CANDIDATE_NAME = "Agniva Chowdhury";
  const CANDIDATE_EMAIL = "agniva179@gmail.com";

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeBase64, setResumeBase64] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [previewJob, setPreviewJob] = useState<Job | null>(null);

  // Email system state
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [emailStatusLoading, setEmailStatusLoading] = useState(false);
  const [applyingJobIds, setApplyingJobIds] = useState<Set<string>>(new Set());
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());

  // Application history from database
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
  const [bulkApplyProgress, setBulkApplyProgress] = useState<BulkApplyProgress | null>(null);

  // Job text input modal state
  const [showJobTextModal, setShowJobTextModal] = useState(false);
  const [jobTextInput, setJobTextInput] = useState("");

  // Email template state — removed (emails come from JSON)
  const [parsingJobText, setParsingJobText] = useState(false);

  // Preview job email editing state
  const [previewJobEmail, setPreviewJobEmail] = useState<{ recipientEmail: string; subject: string; body: string } | null>(null);

  // PDF upload state
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string>("");
  const [pdfExtractionProgress, setPdfExtractionProgress] = useState<{
    totalBatches: number;
    currentBatch: number;
    jobsFound: number;
    pages: number;
  } | null>(null);

  // Match score filter
  const [minMatchScore, setMinMatchScore] = useState<number | undefined>(undefined);

  // Saved prompt backup state
  const [savedPrompt, setSavedPrompt] = useState<string>("");
  const [savedPromptUpdatedAt, setSavedPromptUpdatedAt] = useState<string>("");
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  // Fill email for previewed job
  useEffect(() => {
    if (previewJob) {
      setPreviewJobEmail({
        recipientEmail: previewJob.recruiterEmail || "",
        subject: previewJob.recruiterEmailSubject || "",
        body: previewJob.recruiterEmailBody || "",
      });
    } else {
      setPreviewJobEmail(null);
    }
  }, [previewJob]);

  // Filtered jobs — match score only (experience filtering removed; AI handles eligibility)
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (minMatchScore !== undefined && job.matchScore !== undefined && job.matchScore < minMatchScore) return false;
      return true;
    });
  }, [jobs, minMatchScore]);

  // Eligible jobs for bulk apply
  const eligibleJobsCount = useMemo(() =>
    filteredJobs.filter(job =>
      job.recruiterEmail &&
      !appliedJobIds.has(job.id) &&
      !applyingJobIds.has(job.id) &&
      !applicationHistory.has(job.recruiterEmail.toLowerCase())
    ).length,
    [filteredJobs, appliedJobIds, applyingJobIds, applicationHistory]
  );

  const checkApplicationHistory = useCallback(async (emails: string[]) => {
    if (emails.length === 0) return;
    try {
      const res = await fetch("/api/applications/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.history) setApplicationHistory(new Map(Object.entries(data.history)));
      }
    } catch (err) { console.error("Failed to check application history:", err); }
  }, []);

  const fetchEmailStatus = useCallback(async () => {
    setEmailStatusLoading(true);
    try {
      const res = await fetch("/api/email/status");
      if (res.ok) setEmailStatus(await res.json());
    } catch (err) { console.error("Failed to fetch email status:", err); }
    finally { setEmailStatusLoading(false); }
  }, []);

  const fetchSavedPrompt = useCallback(async () => {
    try {
      const res = await fetch("/api/prompts?name=job_parser");
      if (res.ok) {
        const data = await res.json();
        if (data.prompt) { setSavedPrompt(data.prompt); setSavedPromptUpdatedAt(data.updatedAt || ""); }
      }
    } catch (err) { console.error("Failed to fetch saved prompt:", err); }
  }, []);

  const handleSavePrompt = async () => {
    setSavingPrompt(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "job_parser", prompt: savedPrompt }),
      });
      if (res.ok) { const data = await res.json(); setSavedPromptUpdatedAt(data.updatedAt); }
    } catch (err) { console.error("Failed to save prompt:", err); }
    finally { setSavingPrompt(false); }
  };

  useEffect(() => {
    fetchEmailStatus();
    fetchSavedPrompt();
    const interval = setInterval(fetchEmailStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchEmailStatus, fetchSavedPrompt]);

  const handleApplyToJob = async (job: Job, forceApply = false) => {
    if (!job.recruiterEmail || !resumeFile) return;
    const subject = job.recruiterEmailSubject || "";
    const body = job.recruiterEmailBody || "";
    setEmailPreview({ job, subject, body, forceApply, generating: false });
  };

  const handleConfirmSendEmail = async () => {
    if (!emailPreview) return;
    const { job, subject, body, forceApply } = emailPreview;
    setEmailPreview(null);
    await sendEmailToJob(job, job.recruiterEmail || "", subject, body, forceApply);
  };

  const sendEmailToJob = async (job: Job, recipientEmail: string, subject: string, body: string, forceApply = false) => {
    setApplyingJobIds(prev => new Set(prev).add(job.id));
    try {
      const res = await fetch("/api/email/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recruiterEmail: recipientEmail,
          recruiterName: job.recruiterName || "Hiring Manager",
          jobTitle: job.jobTitle,
          company: job.company || "your company",
          jobDescription: job.jobDescription,
          candidateName: CANDIDATE_NAME,
          candidateEmail: CANDIDATE_EMAIL,
          skills: [],
          forceApply,
          customSubject: subject,
          customBody: body,
          resumeAttachment: resumeBase64 ? { filename: resumeFile?.name || "resume.pdf", content: resumeBase64 } : undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (result.isDuplicate || result.status === "duplicate") {
          if (recipientEmail) await checkApplicationHistory([recipientEmail]);
        }
        return;
      }
      if (result.status === "sent") {
        setAppliedJobIds(prev => new Set(prev).add(job.id));
        if (recipientEmail) {
          setApplicationHistory(prev => new Map(prev).set(recipientEmail.toLowerCase(), {
            appliedAt: new Date().toISOString(),
            jobTitle: job.jobTitle,
            company: job.company || "",
            status: "sent",
          }));
        }
      }
      await fetchEmailStatus();
    } catch (err) { console.error("Failed to send:", err); }
    finally {
      setApplyingJobIds(prev => { const s = new Set(prev); s.delete(job.id); return s; });
    }
  };

  const handleBulkApply = async () => {
    const eligibleJobs = filteredJobs.filter(job =>
      job.recruiterEmail &&
      !appliedJobIds.has(job.id) &&
      !applyingJobIds.has(job.id) &&
      !applicationHistory.has(job.recruiterEmail.toLowerCase())
    );
    if (eligibleJobs.length === 0) return;

    setBulkApplyProgress({ isRunning: true, total: eligibleJobs.length, current: 0, sent: 0, failed: 0, skipped: 0, currentEmail: "", currentCompany: "" });
    let sentCount = 0, failedCount = 0, skippedCount = 0;

    try {
      for (let i = 0; i < eligibleJobs.length; i++) {
        const job = eligibleJobs[i];
        setBulkApplyProgress(prev => prev ? { ...prev, current: i + 1, currentEmail: job.recruiterEmail || "", currentCompany: job.company || job.jobTitle } : null);

        const subject = job.recruiterEmailSubject || "";
        const body = job.recruiterEmailBody || "";

        try {
          const res = await fetch("/api/email/queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recruiterEmail: job.recruiterEmail,
              recruiterName: job.recruiterName || "Hiring Manager",
              jobTitle: job.jobTitle,
              company: job.company || "your company",
              jobDescription: job.jobDescription,
              candidateName: CANDIDATE_NAME,
              candidateEmail: CANDIDATE_EMAIL,
              skills: [],
              customSubject: subject,
              customBody: body,
              resumeAttachment: resumeBase64 ? { filename: resumeFile?.name || "resume.pdf", content: resumeBase64 } : undefined,
            }),
          });
          const result = await res.json();
          if (res.ok && result.status === "sent") {
            sentCount++;
            setAppliedJobIds(prev => new Set(prev).add(job.id));
            if (job.recruiterEmail) {
              setApplicationHistory(prev => new Map(prev).set(job.recruiterEmail!.toLowerCase(), {
                appliedAt: new Date().toISOString(), jobTitle: job.jobTitle, company: job.company || "", status: "sent",
              }));
            }
          } else if (result.status === "duplicate" || result.isDuplicate) {
            skippedCount++;
            if (job.recruiterEmail) await checkApplicationHistory([job.recruiterEmail]);
          } else { failedCount++; }
        } catch (err) { console.error(`Failed to send to ${job.recruiterEmail}:`, err); failedCount++; }

        setBulkApplyProgress(prev => prev ? { ...prev, sent: sentCount, failed: failedCount, skipped: skippedCount } : null);
        if (i < eligibleJobs.length - 1) await new Promise(r => setTimeout(r, 500));
      }
      await fetchEmailStatus();
    } catch (err) { console.error("Bulk send failed:", err); }
    finally { setBulkApplyProgress(prev => prev ? { ...prev, isRunning: false } : null); }
  };

  const handleResumeUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    const reader = new FileReader();
    reader.onload = () => setResumeBase64((reader.result as string).split(",")[1]);
    reader.onerror = () => console.error("Failed to read resume file");
    reader.readAsDataURL(file);
  };

  const handleParseJobText = async () => {
    if (!jobTextInput.trim()) return;

    // Detect pre-matched JSON array (has company_name + matching_score fields)
    let parsed: unknown;
    try { parsed = JSON.parse(jobTextInput.trim()); } catch { parsed = null; }

    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null && "company_name" in parsed[0]) {
      // Pre-matched JSON format — map directly, no Groq call needed
      const newJobs: Job[] = (parsed as Record<string, unknown>[]).map((j) => {
        // matching_score can be integer (new prompt) or "98%" string (old format)
        let score: number | undefined;
        if (typeof j.matching_score === "number") score = j.matching_score;
        else if (typeof j.matching_score === "string") score = parseInt(j.matching_score.replace("%", ""), 10) || undefined;

        // Normalise work_mode → workType
        const workModeRaw = ((j.work_mode as string) || "").toLowerCase();
        const workType: Job["workType"] =
          workModeRaw.includes("remote") ? "remote" :
          workModeRaw.includes("hybrid") ? "hybrid" :
          workModeRaw.includes("wfo") || workModeRaw.includes("on-site") || workModeRaw.includes("onsite") ? "onsite" :
          "unknown";

        return {
          id: Math.random().toString(36).slice(2),
          jobTitle: (j.position as string) || "Unknown Position",
          recruiterEmail: ((j.contact_email as string) || "").trim(),
          recruiterPhone: ((j.contact_phone as string) || "").trim() || "",
          recruiterName: (j.contact_name as string) || "Hiring Manager",
          company: (j.company_name as string) || "",
          location: (j.location as string) || "",
          workType,
          experienceLevel: (j.experience as string) || "",
          salaryRange: (j.salary as string) || "",
          skills: (j.skills as string[]) || [],
          jobType: "unknown" as const,
          status: "idle" as const,
          jobDescription: (j.summary as string) || "",
          matchScore: score,
          matchingSkills: (j.matching_skills as string[]) || undefined,
          missingSkills: (j.missing_skills as string[]) || undefined,
          whyMatched: (j.why_matched as string) || undefined,
          recruiterEmailBody: ((j.recruiter_email_body as string) || "").trim() || undefined,
          recruiterEmailSubject: ((j.recruiter_email_subject as string) || "").trim() || undefined,
          tier: ([1, 2, 3].includes(Number(j.tier)) ? Number(j.tier) : undefined) as 1 | 2 | 3 | undefined,
        };
      });

      setJobs(prev => [...prev, ...newJobs]);
      const hrEmails = newJobs.map(j => j.recruiterEmail).filter((e): e is string => !!e);
      if (hrEmails.length > 0) await checkApplicationHistory(hrEmails);
      setShowJobTextModal(false);
      setJobTextInput("");
      return;
    }

    // Plain text — existing Groq extraction flow
    setParsingJobText(true);
    try {
      const res = await fetch("/api/extract-jobs-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: jobTextInput }),
      });
      if (!res.ok) throw new Error(`Failed to parse: ${res.status}`);
      const data = await res.json();
      if (data.message && data.jobs?.length === 0) return;

      const newJobs: Job[] = (data.jobs || []).map((j: Record<string, unknown>) => ({
        id: Math.random().toString(),
        jobTitle: (j.jobTitle as string) || "Unknown Position",
        recruiterEmail: (j.recruiterEmail as string) || "",
        recruiterPhone: (j.recruiterPhone as string) || "",
        recruiterName: (j.recruiterName as string) || "Unknown",
        company: (j.company as string) || "",
        location: (j.location as string) || "",
        workType: (j.workType as string) || "unknown",
        experienceLevel: (j.experienceLevel as string) || "",
        salaryRange: (j.salaryRange as string) || "",
        skills: (j.skills as string[]) || [],
        jobType: (j.jobType as string) || "unknown",
        status: "idle" as const,
        jobDescription: (j.jobDescription as string) || "",
      }));

      setJobs(prev => [...prev, ...newJobs]);
      const hrEmails = newJobs.map(j => j.recruiterEmail).filter((e): e is string => !!e);
      if (hrEmails.length > 0) await checkApplicationHistory(hrEmails);

      setShowJobTextModal(false);
      setJobTextInput("");
    } catch (err) { console.error("Failed to parse job text:", err); }
    finally { setParsingJobText(false); }
  };

  const handlePdfUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setPdfUploading(true);
    setPdfProgress("Reading PDF…");
    setPdfExtractionProgress(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/extract-jobs-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let allJobs: Job[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line); } catch { continue; }

          if (event.type === "start") {
            setPdfExtractionProgress({
              totalBatches: event.totalBatches as number,
              currentBatch: 0,
              jobsFound: 0,
              pages: event.pages as number,
            });
            setPdfProgress(`Extracting — 0 of ${event.totalBatches} batches`);
          } else if (event.type === "batch") {
            const batchJobs: Job[] = ((event.batchJobs as Record<string, unknown>[]) ?? []).map((j) => ({
              id: Math.random().toString(36).slice(2),
              jobTitle: (j.jobTitle as string) || "Unknown Position",
              recruiterEmail: (j.recruiterEmail as string) || "",
              recruiterPhone: (j.recruiterPhone as string) || "",
              recruiterName: (j.recruiterName as string) || "Hiring Manager",
              company: (j.company as string) || "",
              location: (j.location as string) || "",
              workType: (j.workType as Job["workType"]) || "unknown",
              experienceLevel: (j.experienceLevel as string) || "",
              salaryRange: (j.salaryRange as string) || "",
              skills: (j.skills as string[]) || [],
              jobType: (j.jobType as Job["jobType"]) || "unknown",
              status: "idle" as const,
              jobDescription: (j.jobDescription as string) || "",
            }));
            allJobs = [...allJobs, ...batchJobs];
            // Add batch jobs to grid immediately
            setJobs(prev => [...prev, ...batchJobs]);
            const batchEmails = batchJobs.map(j => j.recruiterEmail).filter((em): em is string => !!em);
            if (batchEmails.length > 0) checkApplicationHistory(batchEmails);

            setPdfExtractionProgress({
              totalBatches: event.totalBatches as number,
              currentBatch: event.batchIndex as number + 1,
              jobsFound: event.totalJobsFound as number,
              pages: 0,
            });
            setPdfProgress(`Batch ${(event.batchIndex as number) + 1} of ${event.totalBatches} — ${event.totalJobsFound} jobs found`);
          } else if (event.type === "done") {
            setPdfProgress(`Done — ${event.totalFound} jobs extracted`);
            setPdfExtractionProgress(null);
            setTimeout(() => setPdfProgress(""), 3000);
          } else if (event.type === "error") {
            throw new Error(event.error as string);
          }
        }
      }
    } catch (err) {
      console.error("PDF upload failed:", err);
      setPdfProgress(err instanceof Error ? err.message : "Upload failed");
      setPdfExtractionProgress(null);
      setTimeout(() => setPdfProgress(""), 4000);
    } finally {
      setPdfUploading(false);
    }
  };

  const handleAnalyzeJob = async (job: Job) => {
    setPreviewJob(prev => prev ? { ...prev, matchScore: undefined } : prev);
    try {
      const res = await fetch("/api/analyze-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      if (!res.ok) return;
      const analysis = await res.json();
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...analysis } : j));
      setPreviewJob(prev => prev?.id === job.id ? { ...prev, ...analysis } : prev);
    } catch (err) {
      console.error("Analyze job failed:", err);
    }
  };

  const handleToggleAccount = async (accountId: string, isActive: boolean) => {    try {
      const res = await fetch("/api/email/accounts/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, isActive }),
      });
      if (res.ok) await fetchEmailStatus();
    } catch (err) { console.error("Failed to toggle account:", err); }
  };

  const handleClearHistory = async () => {
    if (!confirm("Clear all application history? This allows re-sending to same emails.")) return;
    try {
      const res = await fetch("/api/applications/clear", { method: "POST" });
      if (res.ok) {
        await fetchEmailStatus();
        setAppliedJobIds(new Set());
        setApplicationHistory(new Map());
      }
    } catch (err) { console.error("Failed to clear:", err); }
  };

  return (
    <div className={cn(
      "h-screen w-screen bg-[var(--bg-page)] text-[var(--fg-primary)] font-sans flex overflow-hidden selection:bg-[var(--accent-muted)]",
    )}>
      {/* Block interaction overlay during bulk apply */}
      {bulkApplyProgress?.isRunning && (
        <div className="fixed inset-0 z-40 pointer-events-auto cursor-not-allowed" />
      )}

      {/* PDF Extraction Progress Overlay */}
      {pdfExtractionProgress && (
        <div className="fixed inset-x-0 top-0 z-50 flex flex-col items-center pt-4 px-4 pointer-events-none">
          <div className="w-full max-w-md bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-xl px-5 py-4 pointer-events-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-[var(--fg-primary)]">Extracting jobs from PDF</span>
              <span className="text-[10px] text-[var(--fg-muted)]">
                {pdfExtractionProgress.jobsFound} jobs found
              </span>
            </div>
            <p className="text-[10px] text-[var(--fg-secondary)] mb-2.5">
              Batch {pdfExtractionProgress.currentBatch} of {pdfExtractionProgress.totalBatches}
            </p>
            <div className="h-1.5 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                style={{
                  width: pdfExtractionProgress.totalBatches > 0
                    ? `${(pdfExtractionProgress.currentBatch / pdfExtractionProgress.totalBatches) * 100}%`
                    : "0%"
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar */}
      <Sidebar
        resumeFile={resumeFile}
        onResumeUpload={handleResumeUpload}
        emailStatus={emailStatus}
        emailStatusLoading={emailStatusLoading}
        onRefreshEmailStatus={fetchEmailStatus}
        onClearHistory={handleClearHistory}
        onToggleAccount={handleToggleAccount}
        savedPrompt={savedPrompt}
        savedPromptUpdatedAt={savedPromptUpdatedAt}
        promptExpanded={promptExpanded}
        savingPrompt={savingPrompt}
        onSavedPromptChange={setSavedPrompt}
        onPromptExpandedChange={setPromptExpanded}
        onSavePrompt={handleSavePrompt}
        onRestorePrompt={fetchSavedPrompt}
        eligibleJobsCount={eligibleJobsCount}
        bulkApplyRunning={bulkApplyProgress?.isRunning ?? false}
        bulkApplyCurrent={bulkApplyProgress?.current ?? 0}
        bulkApplyTotal={bulkApplyProgress?.total ?? 0}
        onBulkApply={handleBulkApply}
      />

      {/* Main Job Grid */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-page)]">
        {/* Topbar */}
        <div className="h-14 border-b border-[var(--border-default)] flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-medium text-[var(--fg-primary)]">Jobs</h2>
            <div className="h-4 w-px bg-[var(--border-default)]" />
            <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
              <span className="text-[var(--accent)] font-medium">{filteredJobs.length}</span>
              <span>{filteredJobs.length !== jobs.length ? `of ${jobs.length}` : "Total"}</span>
            </div>
            {/* Match score filter */}
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3 h-3 text-[var(--fg-tertiary)]" />
              <span className="text-[10px] text-[var(--fg-secondary)]">Min match:</span>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="—"
                value={minMatchScore ?? ""}
                onChange={e => {
                  const v = e.target.value === "" ? undefined : Math.min(100, Math.max(0, parseInt(e.target.value)));
                  setMinMatchScore(v);
                }}
                className="w-12 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-hover)] bg-[var(--bg-elevated)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
              />
              <span className="text-[10px] text-[var(--fg-secondary)]">%</span>
              {minMatchScore !== undefined && (
                <button
                  onClick={() => setMinMatchScore(undefined)}
                  className="cursor-pointer p-0.5 rounded text-[var(--fg-tertiary)] hover:text-[var(--status-error)] transition-colors duration-150"
                  aria-label="Clear match score filter"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* PDF status message */}
            {pdfProgress && (
              <span className="text-[10px] text-[var(--fg-muted)] flex items-center gap-1">
                {pdfUploading && <Loader2 className="w-3 h-3 animate-spin" />}
                {pdfProgress}
              </span>
            )}
            {/* PDF upload button */}
            <label className={cn(
              "flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded border border-[var(--border-hover)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:border-[var(--border-focus)] transition-colors duration-150 cursor-pointer",
              pdfUploading && "opacity-50 pointer-events-none"
            )}>
              {pdfUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
              Upload PDF
              <input
                type="file"
                accept=".pdf"
                className="sr-only"
                onChange={handlePdfUpload}
                disabled={pdfUploading}
              />
            </label>
            <button
              onClick={() => setShowJobTextModal(true)}
              className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded border border-[var(--border-hover)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:border-[var(--border-focus)] transition-colors duration-150 cursor-pointer"
            >
              <FileText className="w-3 h-3" /> Paste JSON
            </button>
          </div>
        </div>

        {/* Jobs */}
        <div className="p-6 flex-1 overflow-auto">
          {filteredJobs.length === 0 && jobs.length === 0 ? (
            <JobGridEmpty onPaste={() => setShowJobTextModal(true)} />
          ) : filteredJobs.length === 0 && jobs.length > 0 ? (
            <JobGridFiltered
              total={jobs.length}
              onClearFilter={() => setMinMatchScore(undefined)}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredJobs.map(job => {
                const histEntry = job.recruiterEmail
                  ? applicationHistory.get(job.recruiterEmail.toLowerCase())
                  : undefined;
                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    isApplying={applyingJobIds.has(job.id)}
                    isApplied={appliedJobIds.has(job.id)}
                    isFlagged={!!histEntry && !appliedJobIds.has(job.id)}
                    flaggedHistory={histEntry}
                    canApply={!!resumeFile}
                    onApply={() => handleApplyToJob(job)}
                    onPreview={() => setPreviewJob(job)}
                    onRemove={id => setJobs(j => j.filter(x => x.id !== id))}
                    onForceApply={() => handleApplyToJob(job, true)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <JobPreviewModal
        job={previewJob}
        previewJobEmail={previewJobEmail}
        isApplied={previewJob ? appliedJobIds.has(previewJob.id) : false}
        isApplying={previewJob ? applyingJobIds.has(previewJob.id) : false}
        hasHistory={
          previewJob?.recruiterEmail
            ? applicationHistory.has(previewJob.recruiterEmail.toLowerCase())
            : false
        }
        onClose={() => setPreviewJob(null)}
        onSend={(recipientEmail, subject, body, force) => {
          if (previewJob) sendEmailToJob(previewJob, recipientEmail, subject, body, force);
          setPreviewJob(null);
        }}
        onEmailChange={setPreviewJobEmail}
        onAnalyze={handleAnalyzeJob}
      />

      <EmailPreviewModal
        emailPreview={emailPreview}
        onClose={() => setEmailPreview(null)}
        onConfirm={handleConfirmSendEmail}
        onChange={patch => setEmailPreview(prev => prev ? { ...prev, ...patch } : null)}
      />

      <BulkApplyModal
        progress={bulkApplyProgress}
        onClose={() => setBulkApplyProgress(null)}
      />

      <JobTextModal
        open={showJobTextModal}
        value={jobTextInput}
        parsing={parsingJobText}
        onChange={setJobTextInput}
        onClose={() => setShowJobTextModal(false)}
        onParse={handleParseJobText}
      />
    </div>
  );
}
