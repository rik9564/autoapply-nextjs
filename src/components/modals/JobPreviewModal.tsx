// impeccable: modals have AnimatePresence scale-in, ease-out-quart
// ui-ux-pro-max: no emoji icons, cursor-pointer on all interactive elements
// frontend-ui-engineering: focus management — focus close button on open

"use client";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Brain, Target, AlertTriangle, Sparkles,
  Mail, Phone, Send, CheckCheck, AlertCircle, MapPin, Briefcase, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import type { Job } from "@/types";

interface JobPreviewModalProps {
  job: Job | null;
  previewJobEmail: { recipientEmail: string; subject: string; body: string } | null;
  isApplied: boolean;
  isApplying: boolean;
  hasHistory: boolean;
  onClose: () => void;
  onSend: (recipientEmail: string, subject: string, body: string, force?: boolean) => void;
  onEmailChange: (email: { recipientEmail: string; subject: string; body: string }) => void;
  onAnalyze?: (job: Job) => void;
}

// impeccable motion spec: scale-in 0.20s ease-out-quart. No bounce.
const overlayAnim = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };
const panelAnim   = { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 }, transition: { duration: 0.20, ease: "easeOut" as const } };

export function JobPreviewModal({
  job,
  previewJobEmail,
  isApplied,
  isApplying,
  hasHistory,
  onClose,
  onSend,
  onEmailChange,
  onAnalyze,
}: JobPreviewModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // frontend-ui-engineering: move focus to close button on open
  useEffect(() => {
    if (job) closeRef.current?.focus();
  }, [job?.id]);

  return (
    <AnimatePresence>
      {job && (
        <motion.div
          {...overlayAnim}
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-6"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`Job details: ${job.jobTitle}`}
        >
          <motion.div
            {...panelAnim}
            className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="h-12 px-4 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-semibold text-[var(--fg-primary)] truncate">{job.jobTitle}</span>
                {job.matchScore !== undefined && (
                  <span className={cn(
                    "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded",
                    job.matchScore >= 70 ? "bg-[var(--status-success-bg)] text-[var(--accent)]"
                    : job.matchScore >= 40 ? "bg-[var(--status-warning-bg)] text-[var(--status-warning)]"
                    : "bg-[var(--status-error-bg)] text-[var(--status-error)]"
                  )}>
                    {job.matchScore}% match
                  </span>
                )}
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close job preview"
                className="cursor-pointer shrink-0 p-1.5 rounded text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-elevated)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-auto flex-1 space-y-4">
              {/* Recruiter / Company */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="label-xs mb-1">Recruiter</p>
                  <p className="text-sm text-[var(--fg-primary)]">{job.recruiterName || "Unknown"}</p>
                  {job.recruiterEmail && (
                    <a href={`mailto:${job.recruiterEmail}`} className="flex items-center gap-1 text-xs text-[var(--fg-secondary)] hover:text-[var(--accent)] transition-colors duration-150 mt-0.5">
                      <Mail className="w-3 h-3" /> {job.recruiterEmail}
                    </a>
                  )}
                  {job.recruiterPhone && (
                    <a href={`tel:${job.recruiterPhone}`} className="flex items-center gap-1 text-xs text-[var(--fg-secondary)] hover:text-[var(--accent)] transition-colors duration-150 mt-0.5">
                      <Phone className="w-3 h-3" /> {job.recruiterPhone}
                    </a>
                  )}
                </div>
                {job.company && (
                  <div>
                    <p className="label-xs mb-1">Company</p>
                    <p className="text-sm text-[var(--fg-primary)]">{job.company}</p>
                    {job.location && (
                      <p className="flex items-center gap-1 text-xs text-[var(--fg-secondary)] mt-0.5">
                        <MapPin className="w-3 h-3" /> {job.location}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Role badges */}
              {(job.workType || job.experienceLevel || job.jobType) && (
                <div className="flex flex-wrap gap-1.5">
                  {job.workType && job.workType !== "unknown" && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]">
                      <Briefcase className="w-3 h-3" /> {job.workType}
                    </span>
                  )}
                  {job.experienceLevel && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]">{job.experienceLevel}</span>
                  )}
                </div>
              )}

              {/* AI Analysis */}
              {job.aiAnalysis && (
                <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                  <p className="label-xs mb-1.5 flex items-center gap-1.5">
                    <Brain className="w-3 h-3 text-[var(--fg-tertiary)]" /> AI Analysis
                  </p>
                  <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">{job.aiAnalysis}</p>
                </div>
              )}

              {/* Why matched */}
              {job.whyMatched && (
                <div className="p-3 bg-[var(--accent-muted)] border border-[var(--accent-border)] rounded-[var(--radius-md)]">
                  <p className="label-xs mb-1.5 flex items-center gap-1.5 text-[var(--accent)]">
                    <Brain className="w-3 h-3" /> Why matched
                  </p>
                  <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">{job.whyMatched}</p>
                </div>
              )}

              {/* Skills match */}
              {(job.matchingSkills?.length || job.missingSkills?.length) && (
                <div className="grid grid-cols-2 gap-4">
                  {job.matchingSkills && job.matchingSkills.length > 0 && (
                    <div>
                      <p className="label-xs text-[var(--accent)] mb-2 flex items-center gap-1.5">
                        <Target className="w-3 h-3" /> Matching ({job.matchingSkills.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {job.matchingSkills.map((skill, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--status-success-bg)] border border-[var(--accent-border)] text-[var(--accent)]">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {job.missingSkills && job.missingSkills.length > 0 && (
                    <div>
                      <p className="label-xs text-[var(--status-error)] mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" /> To learn ({job.missingSkills.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {job.missingSkills.map((skill, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--status-error-bg)] border border-[var(--status-error)]/20 text-[var(--status-error)]">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Experience match */}
              {job.experienceMatch && job.experienceMatch !== "unknown" && (
                <div>
                  <p className="label-xs mb-1">Experience match</p>
                  <span className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded",
                    job.experienceMatch === "strong" ? "bg-[var(--status-success-bg)] text-[var(--accent)]"
                    : job.experienceMatch === "moderate" ? "bg-[var(--status-warning-bg)] text-[var(--status-warning)]"
                    : "bg-[var(--status-error-bg)] text-[var(--status-error)]"
                  )}>
                    {job.experienceMatch.toUpperCase()}
                  </span>
                  {job.experienceNotes && <span className="text-xs text-[var(--fg-secondary)] ml-2">{job.experienceNotes}</span>}
                </div>
              )}

              {/* Recommendations */}
              {job.recommendations && job.recommendations.length > 0 && (
                <div>
                  <p className="label-xs text-[var(--status-warning)] mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Recommendations
                  </p>
                  <ul className="space-y-1">
                    {job.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-[var(--fg-secondary)] flex items-start gap-2">
                        <span className="text-[var(--status-warning)] mt-0.5" aria-hidden="true">→</span> {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Job description */}
              <div>
                <p className="label-xs mb-1.5">Job description</p>
                <p className="text-xs text-[var(--fg-secondary)] whitespace-pre-wrap max-h-32 overflow-auto bg-[var(--bg-page)] p-3 rounded border border-[var(--border-subtle)] leading-relaxed">
                  {job.jobDescription || "No description extracted"}
                </p>
              </div>

              {/* Email section */}
              {previewJobEmail && !isApplied && (
                <div className="border-t border-[var(--border-subtle)] pt-4 space-y-3">
                  <p className="text-xs font-semibold text-[var(--accent)] flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email to send
                  </p>
                  <div className="space-y-1.5">
                    <label htmlFor="preview-recipient" className="label-xs">To</label>
                    <input
                      id="preview-recipient"
                      type="email"
                      value={previewJobEmail.recipientEmail}
                      onChange={(e) => onEmailChange({ ...previewJobEmail, recipientEmail: e.target.value })}
                      className="w-full h-9 px-3 text-sm rounded-[var(--radius-sm)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="preview-subject" className="label-xs">Subject</label>
                    <input
                      id="preview-subject"
                      type="text"
                      value={previewJobEmail.subject}
                      onChange={(e) => onEmailChange({ ...previewJobEmail, subject: e.target.value })}
                      className="w-full h-9 px-3 text-sm rounded-[var(--radius-sm)]"
                    />
                  </div>
                  <Textarea
                    label="Body"
                    value={previewJobEmail.body}
                    onChange={(e) => onEmailChange({ ...previewJobEmail, body: e.target.value })}
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--border-subtle)] flex gap-2 justify-end">
              {onAnalyze && !job.matchScore && (
                <Button
                  variant="ghost"
                  icon={<Zap className="w-3 h-3" />}
                  onClick={() => onAnalyze(job)}
                >
                  Analyze fit
                </Button>
              )}
              {isApplied ? (
                <span className="flex items-center gap-1.5 text-xs text-[var(--accent)] px-3">
                  <CheckCheck className="w-4 h-4" /> Email sent
                </span>
              ) : previewJobEmail ? (
                hasHistory ? (
                  <Button
                    variant="outline"
                    icon={<AlertCircle className="w-3 h-3" />}
                    onClick={() => onSend(previewJobEmail.recipientEmail, previewJobEmail.subject, previewJobEmail.body, true)}
                    disabled={!previewJobEmail.recipientEmail}
                  >
                    Apply anyway
                  </Button>
                ) : (
                  <Button
                    icon={<Send className="w-3 h-3" />}
                    loading={isApplying}
                    onClick={() => {
                      const isEditedRecipient = previewJobEmail.recipientEmail.toLowerCase() !== (job.recruiterEmail || "").toLowerCase();
                      onSend(previewJobEmail.recipientEmail, previewJobEmail.subject, previewJobEmail.body, isEditedRecipient);
                      onClose();
                    }}
                    disabled={!previewJobEmail.recipientEmail}
                  >
                    Send email
                  </Button>
                )
              ) : null}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
