import { NextRequest, NextResponse } from "next/server";
import {
  groqChatWithRetry,
  processBatches,
  parseGroqJSON,
  EXTRACTION_MODEL,
} from "@/lib/groq";

interface ExtractedJob {
  jobTitle: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string;
  jobDescription: string;
  company?: string;
  location?: string;
  workType?: "remote" | "hybrid" | "onsite" | "unknown";
  experienceLevel?: string;
  salaryRange?: string;
  skills?: string[];
  jobType?: "fulltime" | "contract" | "parttime" | "internship" | "unknown";
}

// ─── Text cleaning ─────────────────────────────────────────────────────────────
const JOB_SEPARATOR = /={5,}/;

const NOISE_PATTERNS = [
  /Shared by Job Curator[^\n]*/gi,
  /Join us on Telegram[^\n]*/gi,
  /t\.me\/[^\s\n]*/gi,
  /https?:\/\/t\.me[^\s\n]*/gi,
  /Join our (channel|group|community)[^\n]*/gi,
  /For more (jobs|opportunities)[^\n]*/gi,
  /Follow us[^\n]*/gi,
  /Subscribe[^\n]*/gi,
  /This document is for Subscribed Members[^\n]*/gi,
];

function stripNoise(text: string): string {
  let cleaned = text;
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n");
  return cleaned.trim();
}

function splitJobBlocks(text: string): string[] {
  return text
    .split(JOB_SEPARATOR)
    .map((b) => b.trim())
    .filter((b) => b.length > 30);
}

// ─── AI prompt ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert job posting parser for Indian IT job listings.

Your task: Extract EVERY job posting from the text and return them as JSON.

For each job posting extract:
- jobTitle: Exact job title
- recruiterName: Contact person name, or "Hiring Manager" if not found
- recruiterEmail: Email address — CRITICAL, search carefully. Use "" if absent.
- recruiterPhone: Phone/mobile including country code, or ""
- jobDescription: 2-3 sentence summary of role, responsibilities, tech stack
- company: Company name (infer from email domain if needed), or ""
- location: City/State or "Remote"/"Hybrid", or ""
- workType: exactly one of "remote", "hybrid", "onsite", "unknown"
- experienceLevel: e.g. "3-5 years", "Senior", or ""
- salaryRange: exact text if present, else ""
- skills: array of technical skills mentioned
- jobType: exactly one of "fulltime", "contract", "parttime", "internship", "unknown"

RULES:
1. Extract ALL jobs — do not skip any
2. Output ONLY valid JSON — no markdown fences, no explanation
3. Escape all special characters inside strings
4. If no jobs found return {"jobs":[]}

Output format:
{"jobs":[{"jobTitle":"","recruiterName":"","recruiterEmail":"","recruiterPhone":"","jobDescription":"","company":"","location":"","workType":"unknown","experienceLevel":"","salaryRange":"","skills":[],"jobType":"unknown"}]}`;

async function extractBatch(
  batch: string[],
  batchIndex: number,
  totalBatches: number
): Promise<ExtractedJob[]> {
  const combinedText = batch
    .map((b, i) => `--- JOB LISTING ${i + 1} ---\n${b}`)
    .join("\n\n");

  try {
    const completion = await groqChatWithRetry({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract all job postings from these ${batch.length} listings (batch ${batchIndex + 1} of ${totalBatches}):\n\n${combinedText}`,
        },
      ],
      temperature: 0.05,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = parseGroqJSON<{ jobs: ExtractedJob[] } | ExtractedJob[]>(content);

    if (parsed) {
      if (Array.isArray(parsed)) {
        console.log(`  Batch ${batchIndex + 1}/${totalBatches}: ${parsed.length} jobs`);
        return parsed;
      }
      if ("jobs" in parsed && Array.isArray(parsed.jobs)) {
        console.log(`  Batch ${batchIndex + 1}/${totalBatches}: ${parsed.jobs.length} jobs`);
        return parsed.jobs;
      }
    }

    console.warn(`  Batch ${batchIndex + 1}/${totalBatches}: parse failed`);
    return [];
  } catch (error) {
    console.error(`  Batch ${batchIndex + 1} error:`, error);
    return [];
  }
}

// ─── Dedup ─────────────────────────────────────────────────────────────────────
function deduplicateJobs(jobs: ExtractedJob[]): ExtractedJob[] {
  const seen = new Map<string, ExtractedJob>();

  for (const job of jobs) {
    const key = job.recruiterEmail
      ? `${job.recruiterEmail.toLowerCase()}|${job.jobTitle.toLowerCase().substring(0, 30)}`
      : `noemail:${job.jobTitle.toLowerCase()}`;

    if (!seen.has(key)) {
      seen.set(key, job);
    } else {
      const existing = seen.get(key)!;
      const score = (j: ExtractedJob) =>
        (j.jobDescription?.length ?? 0) +
        (j.skills?.length ?? 0) * 10 +
        (j.recruiterEmail ? 20 : 0) +
        (j.company ? 5 : 0);
      if (score(job) > score(existing)) seen.set(key, job);
    }
  }

  return Array.from(seen.values());
}

// ─── Route ─────────────────────────────────────────────────────────────────────
const JOBS_PER_BATCH = 20;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawText: string = body.text ?? "";

    if (!rawText.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`EXTRACT JOBS (text): ${rawText.length} chars`);

    const cleaned = stripNoise(rawText);
    const blocks = splitJobBlocks(cleaned);
    console.log(`  Blocks: ${blocks.length}`);

    if (blocks.length === 0) {
      return NextResponse.json({
        jobs: [],
        message: "No job listings found. Ensure text has ===== separators.",
        totalFound: 0,
      });
    }

    const allJobs = await processBatches(blocks, JOBS_PER_BATCH, extractBatch);
    const uniqueJobs = deduplicateJobs(allJobs);

    const withEmail = uniqueJobs.filter((j) => j.recruiterEmail).length;
    console.log(`  Total: ${allJobs.length} → unique: ${uniqueJobs.length} (${withEmail} with email)`);
    console.log(`${"=".repeat(60)}\n`);

    return NextResponse.json({
      jobs: uniqueJobs,
      totalFound: uniqueJobs.length,
      withEmail,
      withoutEmail: uniqueJobs.length - withEmail,
      blocksFound: blocks.length,
    });
  } catch (error) {
    console.error("Extract jobs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to extract jobs" },
      { status: 500 }
    );
  }
}
