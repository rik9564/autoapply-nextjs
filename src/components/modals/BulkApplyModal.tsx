// impeccable skill: framer-motion AnimatePresence scale-in, ease-out-quart
// frontend-ui-engineering skill: focus management, < 200 lines

"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export interface BulkApplyProgress {
  isRunning: boolean;
  total: number;
  current: number;
  sent: number;
  failed: number;
  skipped: number;
  currentEmail: string;
  currentCompany: string;
}

interface BulkApplyModalProps {
  progress: BulkApplyProgress | null;
  onClose: () => void;
}

export function BulkApplyModal({ progress, onClose }: BulkApplyModalProps) {
  const doneButtonRef = useRef<HTMLButtonElement>(null);

  // Focus done button when process finishes
  useEffect(() => {
    if (progress && !progress.isRunning) {
      doneButtonRef.current?.focus();
    }
  }, [progress?.isRunning]);

  const percent =
    progress && progress.total > 0
      ? (progress.current / progress.total) * 100
      : 0;

  return (
    <AnimatePresence>
      {progress && (
        <motion.div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
        >
          <motion.div
            className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg max-w-md w-full overflow-hidden"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0, 0, 1] }}
          >
            {/* Header */}
            <div className="h-12 px-4 border-b border-[var(--border-default)] flex items-center gap-3 shrink-0">
              {progress.isRunning ? (
                <RefreshCw className="w-4 h-4 text-[var(--status-warning)] animate-[spin_0.8s_linear_infinite]" />
              ) : progress.failed === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-[var(--status-success)]" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[var(--status-warning)]" />
              )}
              <span className="text-sm font-semibold text-[var(--fg-primary)]">
                {progress.isRunning ? "Sending Emails…" : "Bulk Apply Complete"}
              </span>
            </div>

            <div className="p-6 space-y-6">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-[var(--fg-secondary)]">
                  <span>Progress</span>
                  <span className="font-mono">
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[var(--accent)] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.3, ease: [0.25, 0, 0, 1] }}
                  />
                </div>
                <div className="text-center text-lg font-bold text-[var(--fg-primary)]">
                  {progress.total - progress.current} remaining
                </div>
              </div>

              {/* Current Email */}
              {progress.isRunning && progress.currentEmail && (
                <div className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded">
                  <div className="text-[10px] uppercase text-[var(--fg-muted)] mb-1">
                    Currently Sending To
                  </div>
                  <div className="text-sm text-[var(--fg-primary)] truncate">
                    {progress.currentEmail}
                  </div>
                  {progress.currentCompany && (
                    <div className="text-xs text-[var(--fg-secondary)] truncate">
                      {progress.currentCompany}
                    </div>
                  )}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div
                  className={cn(
                    "p-3 rounded text-center border",
                    "border-[var(--accent-border)]"
                  )}
                  style={{ background: "var(--status-success-bg)" }}
                >
                  <div
                    className="text-2xl font-bold"
                    style={{ color: "var(--status-success)" }}
                  >
                    {progress.sent}
                  </div>
                  <div
                    className="text-[10px] uppercase"
                    style={{ color: "var(--status-success)" }}
                  >
                    Sent
                  </div>
                </div>
                <div
                  className="p-3 rounded text-center border"
                  style={{
                    background: "var(--status-error-bg)",
                    borderColor: "color-mix(in oklch, var(--status-error) 30%, transparent)",
                  }}
                >
                  <div
                    className="text-2xl font-bold"
                    style={{ color: "var(--status-error)" }}
                  >
                    {progress.failed}
                  </div>
                  <div
                    className="text-[10px] uppercase"
                    style={{ color: "var(--status-error)" }}
                  >
                    Failed
                  </div>
                </div>
                <div
                  className="p-3 rounded text-center border"
                  style={{
                    background: "var(--status-warning-bg)",
                    borderColor: "color-mix(in oklch, var(--status-warning) 30%, transparent)",
                  }}
                >
                  <div
                    className="text-2xl font-bold"
                    style={{ color: "var(--status-warning)" }}
                  >
                    {progress.skipped}
                  </div>
                  <div
                    className="text-[10px] uppercase"
                    style={{ color: "var(--status-warning)" }}
                  >
                    Skipped
                  </div>
                </div>
              </div>

              {/* Warning */}
              {progress.isRunning && (
                <div
                  className="p-3 rounded border text-center"
                  style={{
                    background: "var(--status-warning-bg)",
                    borderColor: "color-mix(in oklch, var(--status-warning) 30%, transparent)",
                  }}
                >
                  <div
                    className="text-xs flex items-center justify-center gap-2"
                    style={{ color: "var(--status-warning)" }}
                  >
                    <AlertCircle className="w-4 h-4" />
                    Please wait. Do not close this window.
                  </div>
                </div>
              )}

              {/* Done Button */}
              {!progress.isRunning && (
                <Button
                  ref={doneButtonRef}
                  className="w-full"
                  variant="primary"
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={onClose}
                >
                  Done
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
