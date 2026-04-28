// impeccable skill: framer-motion AnimatePresence scale-in, ease-out-quart
// frontend-ui-engineering skill: focus management, < 200 lines

"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface JobTextModalProps {
  open: boolean;
  value: string;
  parsing: boolean;
  onChange: (val: string) => void;
  onClose: () => void;
  onParse: () => void;
}

export function JobTextModal({
  open,
  value,
  parsing,
  onChange,
  onClose,
  onParse,
}: JobTextModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus close button on open
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  function handleBackdrop() {
    if (!parsing) onClose();
  }

  const wordCount = value.trim()
    ? value.split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
          onClick={handleBackdrop}
        >
          <motion.div
            className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="h-12 px-4 border-b border-[var(--border-default)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-[var(--status-warning)]" />
                <span className="text-sm font-semibold text-[var(--fg-primary)]">
                  Paste Job Postings
                </span>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                disabled={parsing}
                className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer transition-colors duration-150 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-auto flex-1 space-y-4">
              {/* Instructions */}
              <div className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded">
                <h4 className="text-xs font-medium text-[var(--fg-primary)] mb-1.5 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
                  Paste pre-matched JSON or raw job text
                </h4>
                <p className="text-[11px] text-[var(--fg-secondary)] leading-relaxed">
                  <span className="text-[var(--accent)] font-medium">Pre-matched JSON array</span> — paste a JSON array with fields like{" "}
                  <code className="text-[10px] bg-[var(--bg-elevated)] px-1 rounded">company_name</code>,{" "}
                  <code className="text-[10px] bg-[var(--bg-elevated)] px-1 rounded">matching_score</code>,{" "}
                  <code className="text-[10px] bg-[var(--bg-elevated)] px-1 rounded">contact_email</code> — imported instantly, no AI needed.
                </p>
                <p className="mt-1.5 text-[11px] text-[var(--fg-secondary)] leading-relaxed">
                  <span className="text-[var(--fg-primary)] font-medium">Raw text</span> — paste any job postings and AI will extract the details.
                </p>
              </div>

              {/* Text Input */}
              <div className="flex-1">
                <label className="text-[10px] uppercase font-semibold text-[var(--fg-muted)] mb-1.5 block tracking-wider">
                  Job Postings Text
                </label>
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={`Paste pre-matched JSON array:\n[\n  {\n    "company_name": "TCS",\n    "position": "QA Automation Engineer",\n    "contact_email": "hr@tcs.com",\n    "matching_score": "92%",\n    ...\n  }\n]\n\nOr paste raw job posting text for AI extraction.`}
                  rows={16}
                  disabled={parsing}
                  className="w-full px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded text-sm text-[var(--fg-primary)] focus:outline-none focus:border-[var(--border-focus)] resize-none font-mono leading-relaxed placeholder:text-[var(--fg-muted)] disabled:opacity-50 transition-colors duration-150"
                />
              </div>

              {/* Char / Word Count */}
              <div className="flex justify-between text-[10px] text-[var(--fg-muted)]">
                <span>
                  {wordCount > 0 ? `${wordCount} words` : "No text entered"}
                </span>
                <span>{value.length} characters</span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--border-default)] flex gap-2 justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
                disabled={parsing || !value}
              >
                Clear
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={parsing}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={<Zap className="w-3 h-3" />}
                  onClick={onParse}
                  disabled={parsing || !value.trim()}
                  loading={parsing}
                >
                  {parsing ? "Importing…" : "Import Jobs"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
