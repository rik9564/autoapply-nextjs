# AutoApply — Next.js  
*Living project context — keep this updated after every session*

## External Workflow (Daily Flow)

1. Take Job Curator PDF + resume PDF → attach to **Gemini / Claude / ChatGPT web portal**
2. Use the saved prompt (see "Saved Prompt" in sidebar) → get back a scored JSON array in a code block
3. Copy JSON → paste into **Paste JSON** modal → jobs import instantly with scores + pre-written emails
4. Click Apply on a job → email pre-filled from JSON → send with resume attached

---

## AI Prompt Rules (must include all of these in the external prompt)

- **FULL-TIME ONLY** — skip Contract, Freelance, Part-time, and Internship listings entirely. Do not include them in the output array.
- **Extract ALL full-time opportunities** — do not skip or summarise any listing. Every eligible job must appear in the output.
- **Rank MNCs and well-known brands first** — output the array sorted by company prestige tier: Tier 1 = Fortune 500 / global MNCs, Tier 2 = established Indian/regional companies, Tier 3 = startups/unknown. Within each tier, sort by `matching_score` descending. **IMPORTANT: Tier must be respected absolutely — a Tier 1 company with a score of 40 must appear before a Tier 3 company with a score of 95. Do not let `matching_score` override tier grouping.**
- **Be lenient on experience** — if the candidate has ~4 years, include jobs requiring "3-5 years", "4+ years", "3+ years", "minimum 3 years". Do not exclude borderline matches.
- **Realistic scores** — do not inflate. A 70+ means genuinely strong match. 90+ reserved for near-perfect fits.
- **`company_name` must never be null** — use "Unknown Company" if not found.
- **`recruiter_email_body` and `recruiter_email_subject` must always be present** — write a complete, personalised outreach email. Use `\n` for line breaks. No trailing whitespace.
- **Notice period — HARD RULES (never violate any of these):**
  1. Candidate is currently employed and has NOT yet resigned. The clock starts from date of resignation, not today.
  2. Official notice period is 60 days from resignation. Buyout is available. Can burn accumulated leaves — minimum joining time is **30 days from resignation, never less than 30 days under any circumstances**.
  3. **NEVER use a specific calendar date** (e.g. "7th May", "by May end") — always use relative language: "within 30 days of my resignation", "approximately 30 days after resigning", etc.
  4. **NEVER say** "immediate joiner", "immediately available", "early joiner", "available to join before [date]", or imply a joining timeline of less than 30 days.
  5. **Standard joining language to use:** "I can join within 30 days of my resignation, leveraging a buyout or leave encashment. My official notice period is 60 days, but I am confident I can manage a 30-day transition."
  6. **If the job listing explicitly requires immediate joiners / 0–15 days notice:** Do NOT pretend to meet that requirement. Instead, acknowledge it honestly but positively — example: "I notice you are looking for someone who can join immediately. While my minimum joining time is 30 days from resignation (through buyout/leave encashment), I am confident my technical fit makes me worth the brief wait. I would love to discuss if there is any flexibility." Frame the 30-day timeline as a strength (structured transition, no abrupt departure) not an obstacle.
  7. These rules override any other instruction. No exception.

---

## JSON Output Format

```json
{
  "company_name": "string — never null, use 'Unknown Company' if missing",
  "position": "string",
  "location": "string",
  "experience": "string",
  "job_type": "Full-time",
  "work_mode": "Remote|Hybrid|WFO|On-site|null",
  "salary": "string|null",
  "skills": ["..."],
  "matching_skills": ["..."],
  "missing_skills": ["..."],
  "contact_email": "trimmed string|null",
  "contact_phone": "string|null",
  "contact_name": "string|null",
  "matching_score": 0-100,
  "tier": 1,
  "summary": "1-2 sentence role description",
  "why_matched": "1 sentence specific reason this role fits the candidate",
  "recruiter_email_subject": "string — personalised subject line",
  "recruiter_email_body": "full email body with \\n for line breaks, no trailing whitespace"
}
```

> `tier` values: **1** = Fortune 500 / global MNC, **2** = established Indian/regional company, **3** = startup or unknown brand.

---
---

## Design Rules (non-negotiable)

- **Dark Obsidian theme only** — OKLCH CSS tokens in `:root` + `@theme inline`
- **No emoji icons** — Lucide icons only
- **No side-stripe borders** — use background tints for status differentiation
- **No glassmorphism** as default
- **`cursor-pointer` on all clickable elements**
- **150–300ms transitions** (`duration-150` or `duration-200`)
- **CVA for Button variants** (`src/components/ui/Button.tsx`)
- **framer-motion modals**: `AnimatePresence` + scale-in 0.20s ease-out-quart, no bounce
- **Components < 200 lines** where possible
- Use **CSS variables** (`var(--accent)`, `var(--bg-panel)`, etc.) not raw hex

---

## AI / Model Rules

| Task | Model | Notes |
|---|---|---|
| PDF job extraction | `meta-llama/llama-4-scout-17b-16e-instruct` | 30K TPM, batch 20, max_tokens 8192 hard cap |
| Per-job match analysis | `openai/gpt-oss-120b` | 8K TPM, called per job, never for email writing |
| Email generation | **No AI** — comes from JSON `recruiter_email_body` + `recruiter_email_subject` | No tokens spent |

- 3-second delay between Groq batches to stay under TPM limits
- gpt-oss-120b is the only model for analysis — do not swap it out

---

## Key Technical Findings

- **`unpdf`** (not `pdf-parse`) — ESM-only, must be dynamically imported, returns `{ totalPages, text: string[] }`
- **`llama-4-scout` max_tokens hard cap is 8192** — 400 error if exceeded
- **`export const maxDuration = 300`** in App Router routes (not `config.api.bodyParser`)
- **Supabase env vars** must be restored from `C:/Auto_Apply/autoapply-ai/.env.local` if lost
- **SMTP credentials** live in Supabase `email_accounts` table — not env vars
- **`candidate.experience`** stores decimal years (e.g. 4.333) — always format via `experienceLabel` useMemo
- **Delete `.next` folder** after `.env.local` changes (Turbopack caches env vars)
- **`selection:bg-[var(--bg-subtle)]`** was a bug — variable doesn't exist, made text selection invisible. Use `selection:bg-[var(--accent-muted)]`
- **`pointer-events-none` on root div** blocks text selection everywhere — put it only on overlay divs

---

## Architecture

```
C:\Auto_Apply\autoapply-nextjs/
│
├── .env.local                          GROQ_API_KEY + SUPABASE_URL + SUPABASE_ANON_KEY
├── start-local.js                      Groq key checker (not Ollama)
│
├── src/
│   ├── app/
│   │   ├── globals.css                 OKLCH design tokens
│   │   ├── page.tsx                    Main page — ~730 lines
│   │   └── api/
│   │       ├── extract-jobs-text/      Groq llama-4-scout, text input
│   │       ├── extract-jobs-pdf/       NDJSON streaming, unpdf, maxDuration 300
│   │       ├── analyze-job/            gpt-oss-120b per-job analysis
│   │       ├── email/queue/            Send email
│   │       ├── email/status/           Email account status
│   │       ├── email/accounts/toggle/  Toggle SMTP account
│   │       ├── applications/check/     Check history
│   │       ├── applications/clear/     Clear history
│   │       └── prompts/                Job parser prompt CRUD
│   │
│   ├── components/
│   │   ├── ui/Button.tsx               CVA-based
│   │   ├── ui/Input.tsx                Input + Textarea
│   │   ├── jobs/JobCard.tsx            Card + match score badge + empty/skeleton states
│   │   ├── layout/Sidebar.tsx
│   │   └── modals/
│   │       ├── JobPreviewModal.tsx     Has onAnalyze prop + "Analyze fit" button
│   │       ├── EmailPreviewModal.tsx
│   │       ├── BulkApplyModal.tsx
│   │       └── JobTextModal.tsx        "Paste JSON" modal — accepts raw JSON array
│   │
   │   ├── lib/
│   │   ├── groq.ts                     Client, retry (429), processBatches, sleep, parseGroqJSON
│   │   ├── email-templates.ts          Dead code — emails now come entirely from JSON
│   │   ├── email-sender.ts
│   │   ├── gmail-accounts.ts           Reads SMTP from Supabase DB
│   │   ├── supabase.ts
│   │   ├── settings.ts
│   │   └── ai-service.ts               Dead code (Ollama ref) — not called anywhere
│   │
│   └── types.ts                        Job has matchScore, matchingSkills, missingSkills fields
```

---

### Phase 4 — JSON Import & Email from JSON
- Pre-matched JSON array paste detection (has `company_name` + `matching_score`) — maps directly, no Groq
- Full field mapping: `position→jobTitle`, `company_name→company`, `work_mode→workType`, `matching_score`, `summary→jobDescription`, `matching_skills`, `missing_skills`, `why_matched`, `recruiter_email_body`, `recruiter_email_subject`
- `.trim()` on email fields (fixes ChatGPT trailing newline)
- `whyMatched` shown in JobPreviewModal as teal callout
- Email Template section removed from Sidebar — subject + body come 100% from JSON
- `recruiterEmailSubject` and `recruiterEmailBody` stored on `Job` type, auto-fill compose window

---

## Known Issues / Gotchas

- ChatGPT produces better quality JSON than Gemini (Gemini inflates scores, gave 100s; ChatGPT is more realistic)
- ChatGPT adds trailing `\n` in email strings — fixed by `.trim()` in mapper
- Gemini sometimes outputs `company_name: null` — fixed by prompt rule "never null"
- `llama-4-scout` hard caps at `max_tokens: 8192` — 400 error if exceeded
- `unpdf` is ESM-only — must be dynamically imported
- Delete `.next` folder after `.env.local` changes (Turbopack caches env vars)
- `selection:bg-[var(--bg-subtle)]` is a bug — variable doesn't exist; use `--accent-muted`
- `pointer-events-none` on root div blocks text selection — only apply to overlay divs

---

## What Needs To Be Done Next

*(as of end of last session — all previous tasks complete)*

No outstanding items. The app is in a clean, fully functional state.
If reopening: run `npm run dev` and verify the app loads at http://localhost:3000.

### Phase 1 — UI Refactor
- Obsidian theme, OKLCH tokens, CVA Button, all components extracted from monolithic page.tsx

### Phase 2 — Groq Integration
- PDF extraction via streaming NDJSON (batches of 20, jobs appear in grid in real-time)
- PDF progress overlay (top banner, animated progress bar, batch counter)
- Per-job analysis via gpt-oss-120b
- Text job parsing via llama-4-scout

### Phase 3 — Fixes & Polish
- `experienceLabel` useMemo — "4 years 4 months", never decimal
- Match score badge on JobCard (green ≥70, amber 40-69, red <40)
- Min match score filter in topbar (number input + clear button)
- Fixed text selection bug (`--bg-subtle` → `--accent-muted`)
- Fixed `pointer-events-none` on root div blocking all interaction

---

## What Needs To Be Done Next

### 1. Auto batch analysis after import (HIGHEST PRIORITY)

After jobs arrive via **either** import path (PDF or JSON paste), automatically run match analysis on all new jobs using gpt-oss-120b. This should:

- Run **immediately and blocking** after import completes
- Show a progress overlay: "Analyzing job X of Y" with a progress bar
- Each job gets `matchScore`, `matchingSkills`, `missingSkills` written back into state as it completes
- Use the existing `/api/analyze-job` endpoint (one call per job, sequential to respect 8K TPM)
- After all analysis done, dismiss overlay — grid is fully scored

Implementation sketch:
```ts
// After setJobs([...prev, ...newJobs])
await runBatchAnalysis(newJobs); // new helper in page.tsx

async function runBatchAnalysis(jobs: Job[]) {
  setAnalysisProgress({ total: jobs.length, current: 0 });
  for (let i = 0; i < jobs.length; i++) {
    const result = await fetch("/api/analyze-job", { ... });
    const analysis = await result.json();
    setJobs(prev => prev.map(j => j.id === jobs[i].id ? { ...j, ...analysis } : j));
    setAnalysisProgress({ total: jobs.length, current: i + 1 });
  }
  setAnalysisProgress(null);
}
```

### 2. JSON paste modal — accept raw JSON array

The existing "Paste JSON" modal (`JobTextModal`) currently sends text to `/api/extract-jobs-text` (Groq extraction). It needs to:
- **Detect** if the pasted content is a valid JSON array
- If yes → parse directly (no Groq call), map to `Job[]`, then trigger batch analysis
- If no (plain text) → existing Groq extraction flow, then trigger batch analysis

### 3. Candidate profile used in analysis

The `/api/analyze-job` route currently doesn't receive the candidate's skills/experience. For accurate match scores, it needs:
- `candidate.name`, `candidate.experience` (decimal), `candidate.skills` (if added to profile)
- Or at minimum, the resume text (base64 decoded) to infer skills from

Check `src/app/api/analyze-job/route.ts` to see what it currently uses as the "candidate side" of the match.
