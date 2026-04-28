// impeccable skill: no identical card grids — status-based visual differentiation
// ui-ux-pro-max skill: no emoji icons, cursor-pointer, 150-300ms transitions
// frontend-ui-engineering skill: <200 lines, proper empty/loading states
// impeccable absolute ban: no side-stripe borders > 1px. Use background tint for status.

import {
  User, Mail, Phone, Send, Eye, X, CheckCheck,
  AlertCircle, MapPin, Briefcase, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { Job } from "@/types";

interface JobCardProps {
  job: Job;
  isApplying: boolean;
  isApplied: boolean;
  isFlagged: boolean;
  flaggedHistory?: { appliedAt: string; jobTitle: string; company: string };
  canApply: boolean;
  onApply: (job: Job) => void;
  onPreview: (job: Job) => void;
  onRemove: (jobId: string) => void;
  onForceApply?: (job: Job) => void;
}

export function JobCard({
  job,
  isApplying,
  isApplied,
  isFlagged,
  flaggedHistory,
  canApply,
  onApply,
  onPreview,
  onRemove,
  onForceApply,
}: JobCardProps) {
  // impeccable: status differentiation via background tint, not side-stripe
  const cardTint = isApplied
    ? "bg-[var(--status-success-bg)] border-[var(--accent-border)]"
    : isFlagged
    ? "bg-[var(--status-warning-bg)] border-[var(--status-warning)]/20"
    : "bg-[var(--bg-panel)] border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-panel-hover)]";

  return (
    <article
      className={cn(
        "group relative rounded-[var(--radius-lg)] border p-4",
        "transition-all duration-150",  // ui-ux-pro-max: 150-300ms
        cardTint
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-[var(--fg-primary)] leading-snug truncate">
            {job.jobTitle || "Untitled Position"}
          </h4>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--fg-secondary)]">
            <User className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{job.recruiterName || "Unknown"}</span>
            {job.company && (
              <>
                <span className="text-[var(--fg-tertiary)]" aria-hidden="true">·</span>
                <span className="truncate text-[var(--fg-tertiary)]">{job.company}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-start gap-1 shrink-0">
          {/* Tier badge */}
          {job.tier !== undefined && (
            <div className={cn(
              "flex items-center justify-center rounded-lg px-2 py-1 min-w-[32px] text-[9px] font-bold border",
              job.tier === 1
                ? "bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent-border)]"
                : job.tier === 2
                ? "bg-[var(--bg-elevated)] text-[var(--fg-secondary)] border-[var(--border-subtle)]"
                : "bg-[var(--bg-elevated)] text-[var(--fg-tertiary)] border-[var(--border-subtle)]"
            )}>
              T{job.tier}
            </div>
          )}

          {/* Match score badge */}
          {job.matchScore !== undefined && (
            <div className={cn(
              "flex flex-col items-center justify-center rounded-lg px-2 py-1 min-w-[44px]",
              job.matchScore >= 70
                ? "bg-[var(--status-success-bg)] text-[var(--accent)] border border-[var(--accent-border)]"
                : job.matchScore >= 40
                ? "bg-[var(--status-warning-bg)] text-[var(--status-warning)] border border-[var(--status-warning)]/20"
                : "bg-[var(--status-error-bg)] text-[var(--status-error)] border border-[var(--status-error)]/20"
            )}>
              <span className="text-base font-bold leading-none">{job.matchScore}</span>
              <span className="text-[8px] leading-none mt-0.5 opacity-80">% match</span>
            </div>
          )}

          {/* Remove button — visible on hover */}
          <button
            onClick={() => onRemove(job.id)}
            aria-label={`Remove ${job.jobTitle}`}
            className={cn(
              "cursor-pointer shrink-0 p-1 rounded transition-colors duration-150",
              "text-[var(--fg-disabled)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-bg)]",
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            )}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Badges row — work type, experience, location */}
      {(job.workType || job.experienceLevel || job.location) && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {job.workType && job.workType !== "unknown" && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--fg-tertiary)] border border-[var(--border-subtle)]">
              <Briefcase className="w-2.5 h-2.5" aria-hidden="true" />
              {job.workType}
            </span>
          )}
          {job.experienceLevel && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--fg-tertiary)] border border-[var(--border-subtle)]">
              {job.experienceLevel}
            </span>
          )}
          {job.location && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--fg-tertiary)] border border-[var(--border-subtle)]">
              <MapPin className="w-2.5 h-2.5" aria-hidden="true" />
              {job.location}
            </span>
          )}
        </div>
      )}

      {/* Contact info — the most important field */}
      {job.recruiterEmail || job.recruiterPhone ? (
        <div className="flex flex-wrap gap-2 text-[10px] mb-2.5 px-2 py-1.5 rounded bg-[var(--accent-muted)] border border-[var(--accent-border)]">
          {job.recruiterEmail && (
            <span className="flex items-center gap-1 text-[var(--accent)]">
              <Mail className="w-3 h-3" aria-hidden="true" />
              {job.recruiterEmail}
            </span>
          )}
          {job.recruiterPhone && (
            <span className="flex items-center gap-1 text-[var(--accent)]">
              <Phone className="w-3 h-3" aria-hidden="true" />
              {job.recruiterPhone}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[10px] mb-2.5 px-2 py-1.5 rounded bg-[var(--bg-elevated)] text-[var(--fg-tertiary)] border border-[var(--border-subtle)]">
          <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
          No email — cannot auto-apply
        </div>
      )}

      {/* Skills chips */}
      {job.skills && job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5" aria-label="Required skills">
          {job.skills.slice(0, 4).map((skill, i) => (
            <span
              key={i}
              className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]"
            >
              {skill}
            </span>
          ))}
          {job.skills.length > 4 && (
            <span className="text-[8px] px-1 text-[var(--fg-tertiary)]">
              +{job.skills.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Status banners */}
      {isApplied && (
        <div className="flex items-center gap-1.5 mb-2.5 text-[9px] px-2 py-1 rounded bg-[var(--status-success-bg)] border border-[var(--accent-border)] text-[var(--accent)]">
          <CheckCheck className="w-3 h-3" aria-hidden="true" />
          Email sent
        </div>
      )}

      {isFlagged && !isApplied && flaggedHistory && (
        <div className="mb-2.5 text-[9px] px-2 py-1.5 rounded bg-[var(--status-warning-bg)] border border-[var(--status-warning)]/20">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[var(--status-warning)]">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              Previously contacted
            </span>
            <button
              onClick={() => onForceApply?.(job)}
              className="cursor-pointer text-[8px] px-1.5 py-0.5 rounded bg-[var(--status-warning)]/20 text-[var(--status-warning)] hover:bg-[var(--status-warning)]/30 transition-colors duration-150"
            >
              Apply anyway
            </button>
          </div>
          <div className="text-[8px] text-[var(--fg-secondary)] mt-0.5">
            {new Date(flaggedHistory.appliedAt).toLocaleDateString()} · {flaggedHistory.jobTitle}
            {flaggedHistory.company ? ` at ${flaggedHistory.company}` : ""}
          </div>
        </div>
      )}

      {job.errorMessage && (
        <p className="text-[10px] text-[var(--status-error)] mb-2.5">{job.errorMessage}</p>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-2.5 border-t border-[var(--border-subtle)]">
        <span className="label-xs">
          {isApplied ? "applied" : isFlagged ? "flagged" : "ready"}
        </span>
        <div className="flex gap-1">
          {canApply && job.recruiterEmail && !isApplied && !isFlagged && (
            <Button
              variant="ghost"
              size="xs"
              icon={isApplying ? undefined : <Send className="w-3 h-3" />}
              loading={isApplying}
              onClick={() => onApply(job)}
              aria-label={`Apply to ${job.jobTitle}`}
            >
              {isApplying ? "Sending" : "Apply"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            icon={<Eye className="w-3 h-3" />}
            onClick={() => onPreview(job)}
            aria-label={`Preview ${job.jobTitle}`}
          >
            Preview
          </Button>
        </div>
      </div>
    </article>
  );
}

// frontend-ui-engineering: meaningful empty state
export function JobGridEmpty({ onPaste }: { onPaste: () => void }) {
  return (
    <button
      onClick={onPaste}
      className={cn(
        "cursor-pointer w-full h-44 border border-dashed rounded-[var(--radius-lg)]",
        "border-[var(--border-subtle)] hover:border-[var(--border-hover)]",
        "flex flex-col items-center justify-center gap-2",
        "transition-colors duration-150 text-[var(--fg-tertiary)] hover:text-[var(--fg-secondary)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      )}
      aria-label="Paste job data to get started"
    >
      <Briefcase className="w-6 h-6" aria-hidden="true" />
      <div className="text-center">
        <p className="text-sm font-medium">Paste job postings</p>
        <p className="text-xs mt-0.5">Click to add jobs from Job Curator</p>
      </div>
    </button>
  );
}

export function JobGridFiltered({
  total,
  onClearFilter,
}: {
  total: number;
  onClearFilter: () => void;
}) {
  return (
    <div className="h-44 border border-dashed border-[var(--status-warning)]/30 rounded-[var(--radius-lg)] flex flex-col items-center justify-center gap-3 bg-[var(--status-warning-bg)]">
      <AlertCircle className="w-7 h-7 text-[var(--status-warning)]" aria-hidden="true" />
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--status-warning)]">No jobs match your experience</p>
        <p className="text-xs text-[var(--fg-secondary)] mt-0.5">
          {total} job{total !== 1 ? "s" : ""} hidden by experience filter
        </p>
      </div>
      <Button variant="outline" size="xs" onClick={onClearFilter}>
        Clear filter
      </Button>
    </div>
  );
}

// frontend-ui-engineering: skeleton loading state
export function JobCardSkeleton() {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4 space-y-3"
      aria-busy="true"
      aria-label="Loading job"
    >
      <div className="space-y-1.5">
        <div className="h-4 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
      <div className="h-7 rounded bg-[var(--bg-elevated)] animate-pulse" />
      <div className="flex gap-1">
        <div className="h-4 w-12 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-16 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-10 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    </div>
  );
}
