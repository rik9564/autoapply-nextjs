"use client";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import type { Job } from "@/types";

interface EmailPreviewModalProps {
  emailPreview: {
    job: Job;
    subject: string;
    body: string;
    forceApply: boolean;
    generating: boolean;
  } | null;
  onClose: () => void;
  onConfirm: () => void;
  onChange: (patch: { subject?: string; body?: string }) => void;
}

const overlayAnim = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };
const panelAnim   = { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 }, transition: { duration: 0.20, ease: "easeOut" as const } };

export function EmailPreviewModal({
  emailPreview,
  onClose,
  onConfirm,
  onChange,
}: EmailPreviewModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (emailPreview && !emailPreview.generating) closeRef.current?.focus();
  }, [emailPreview?.job.id, emailPreview?.generating]);

  return (
    <AnimatePresence>
      {emailPreview && (
        <motion.div
          {...overlayAnim}
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-6"
          onClick={() => !emailPreview.generating && onClose()}
          role="dialog"
          aria-modal="true"
          aria-label="Review and edit email"
        >
          <motion.div
            {...panelAnim}
            className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="h-12 px-4 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
                <span className="text-sm font-semibold text-[var(--fg-primary)]">
                  {emailPreview.generating ? "Generating email..." : "Review and edit email"}
                </span>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                disabled={emailPreview.generating}
                aria-label="Close email preview"
                className="cursor-pointer p-1.5 rounded text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-elevated)] transition-colors duration-150 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {emailPreview.generating ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-8 h-8 border-2 border-[var(--status-warning)] border-t-transparent rounded-full animate-[spin_0.8s_linear_infinite]" aria-hidden="true" />
                <div className="text-center">
                  <p className="text-sm text-[var(--fg-secondary)]">Generating personalized cover letter</p>
                  <p className="text-xs text-[var(--fg-tertiary)] mt-1">This may take a few seconds</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 overflow-auto flex-1 space-y-4">
                  {/* Recipient info */}
                  <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[var(--fg-tertiary)]">To:</span>
                      <span className="text-[var(--fg-primary)] ml-2">{emailPreview.job.recruiterEmail}</span>
                    </div>
                    <div>
                      <span className="text-[var(--fg-tertiary)]">Position:</span>
                      <span className="text-[var(--fg-primary)] ml-2">{emailPreview.job.jobTitle}</span>
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="space-y-1.5">
                    <label htmlFor="email-subject" className="label-xs">Subject</label>
                    <input
                      id="email-subject"
                      type="text"
                      value={emailPreview.subject}
                      onChange={(e) => onChange({ subject: e.target.value })}
                      className="w-full h-9 px-3 text-sm rounded-[var(--radius-sm)]"
                    />
                  </div>

                  {/* Body */}
                  <Textarea
                    id="email-body"
                    label="Email body"
                    value={emailPreview.body}
                    onChange={(e) => onChange({ body: e.target.value })}
                    rows={16}
                    className="font-mono text-sm"
                  />

                  {/* Word / char count */}
                  <div className="flex justify-between text-[10px] text-[var(--fg-tertiary)]">
                    <span>{emailPreview.body.split(/\s+/).filter(Boolean).length} words</span>
                    <span>{emailPreview.body.length} characters</span>
                  </div>
                </div>

                <div className="p-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw className="w-3 h-3" />}
                    onClick={() => {
                      onChange({
                        subject: emailPreview.job.recruiterEmailSubject || "",
                        body: emailPreview.job.recruiterEmailBody || "",
                      });
                    }}
                  >
                    Reset to template
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                      icon={<Send className="w-3 h-3" />}
                      onClick={onConfirm}
                      disabled={!emailPreview.subject.trim() || !emailPreview.body.trim()}
                    >
                      Send email
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
