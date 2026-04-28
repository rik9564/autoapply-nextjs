import { NextRequest, NextResponse } from "next/server";
import {
  groqChatWithRetry,
  parseGroqJSON,
  EXTRACTION_MODEL,
  sleep,
} from "@/lib/groq";

// ─── Types ─────────────────────────────────────────────────────────────────────
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

// ─── PDF extraction using unpdf ────────────────────────────────────────────────
async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string[]> {
  // unpdf is an ESM package — dynamic import required
  const { extractText } = await import("unpdf");
  const result = await extractText(new Uint8Array(buffer));
  // result.text is string[] — one entry per page
  return Array.isArray(result.text) ? result.text : [result.text as unknown as string];
}

// ─── Noise stripping ───────────────────────────────────────────────────────────
const NOISE_PATTERNS = [
  /Shared by Job Curator[^\n]*/gi,
  /Join us on Telegram[^\n]*/gi,
  /t\.me\/[^\s\n]*/gi,
  /https?:\/\/t\.me[^\s\n]*/gi,
  /This document is for Subscribed Members[^\n]*/gi,
  /Join our (channel|group|community)[^\n]*/gi,
  /For more (jobs|opportunities)[^\n]*/gi,
];

function stripPageNoise(page: string): string {
  let cleaned = page;
  for (const p of NOISE_PATTERNS) {
    cleaned = cleaned.replace(p, "");
  }
  return cleaned.replace(/\n{4,}/g, "\n\n").trim();
}

// ─── Job block splitting ───────────────────────────────────────────────────────
const JOB_SEPARATOR = /={5,}/g;
// Location-header lines like ===== BANGALORE/CHENNAI ===== (short text between ===)
const LOCATION_HEADER = /^[=\s]+[A-Z/ ]+[=\s]+$/;

function splitIntoJobBlocks(pages: string[]): string[] {
  const fullText = pages.map(stripPageNoise).join("\n\n");
  const blocks = fullText.split(JOB_SEPARATOR);

  return blocks
    .map((b) => b.trim())
    .filter((b) => {
      if (b.length < 40) return false;
      if (LOCATION_HEADER.test(b.replace(/\n/g, " ").trim())) return false;
      return true;
    });
}

// ─── AI extraction prompt ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert job posting parser for Indian IT job listings.

Extract EVERY job posting from the provided text and return them as a JSON object.

For each job posting extract:
- jobTitle: Exact job title (strip emoji prefixes like 🔹 ✅ 🚀)
- recruiterName: Contact person name, or "Hiring Manager" if not found
- recruiterEmail: Email address — CRITICAL. Search for @, "send CV to", "mail to", etc. Use "" if absent.
- recruiterPhone: Phone/mobile including country code, or ""
- jobDescription: 2-3 sentence summary of role, responsibilities, tech stack
- company: Company name (infer from email domain if possible), or ""
- location: City/State or "Remote"/"Hybrid", or ""
- workType: exactly one of "remote", "hybrid", "onsite", "unknown"
- experienceLevel: e.g. "3-5 years", "5+ years", "Senior", or ""
- salaryRange: exact text if present, else ""
- skills: array of technical skills (programming languages, frameworks, tools)
- jobType: exactly one of "fulltime", "contract", "parttime", "internship", "unknown"

STRICT RULES:
1. Extract ALL jobs — never skip a posting
2. Output ONLY valid JSON — no markdown fences, no explanation, no preamble
3. If no jobs found return: {"jobs":[]}

Output: {"jobs":[...]}`;

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
          content: `Extract all jobs from these ${batch.length} listings (batch ${batchIndex + 1}/${totalBatches}):\n\n${combinedText}`,
        },
      ],
      temperature: 0.05,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = parseGroqJSON<{ jobs: ExtractedJob[] } | ExtractedJob[]>(content);

    if (parsed) {
      const jobs = Array.isArray(parsed)
        ? parsed
        : "jobs" in parsed
        ? parsed.jobs
        : [];
      console.log(`  Batch ${batchIndex + 1}/${totalBatches}: ${jobs.length} jobs`);
      return jobs;
    }

    console.warn(`  Batch ${batchIndex + 1}/${totalBatches}: parse failed`);
    return [];
  } catch (error) {
    console.error(`  Batch ${batchIndex + 1} error:`, error);
    return [];
  }
}

// ─── Deduplication ─────────────────────────────────────────────────────────────
function deduplicateJobs(jobs: ExtractedJob[]): ExtractedJob[] {
  const seen = new Map<string, ExtractedJob>();
  for (const job of jobs) {
    const key = job.recruiterEmail
      ? `${job.recruiterEmail.toLowerCase()}|${job.jobTitle.toLowerCase().substring(0, 30)}`
      : `noemail:${job.jobTitle.toLowerCase().substring(0, 40)}`;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, job);
    } else {
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

// ─── Route handler — streams NDJSON progress ──────────────────────────────────
const JOBS_PER_BATCH = 20;

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a PDF file" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileSizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`EXTRACT JOBS (PDF): ${fileSizeMB} MB`);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        // 1. Parse PDF
        const pages = await extractTextFromPDF(arrayBuffer);
        const totalChars = pages.reduce((s, p) => s + p.length, 0);
        console.log(`  PDF: ${pages.length} pages, ${totalChars} chars`);

        // 2. Split into blocks
        const blocks = splitIntoJobBlocks(pages);
        console.log(`  Blocks: ${blocks.length}`);

        if (blocks.length === 0) {
          send({ type: "done", jobs: [], totalFound: 0, pages: pages.length });
          controller.close();
          return;
        }

        const totalBatches = Math.ceil(blocks.length / JOBS_PER_BATCH);
        send({ type: "start", totalBlocks: blocks.length, totalBatches, pages: pages.length });

        // 3. Process batches — stream progress after each one
        const allJobs: ExtractedJob[] = [];

        for (let i = 0; i < blocks.length; i += JOBS_PER_BATCH) {
          const batchIndex = i / JOBS_PER_BATCH;
          const batch = blocks.slice(i, i + JOBS_PER_BATCH);
          const batchJobs = await extractBatch(batch, batchIndex, totalBatches);
          allJobs.push(...batchJobs);

          send({
            type: "batch",
            batchIndex,
            totalBatches,
            batchJobsFound: batchJobs.length,
            totalJobsFound: allJobs.length,
          });

          if (i + JOBS_PER_BATCH < blocks.length) {
            await sleep(3000);
          }
        }

        // 4. Deduplicate and send final result
        const uniqueJobs = deduplicateJobs(allJobs);
        const withEmail = uniqueJobs.filter((j) => j.recruiterEmail).length;

        console.log(`  Total: ${allJobs.length} → unique: ${uniqueJobs.length} (${withEmail} with email)`);
        console.log(`${"=".repeat(60)}\n`);

        send({
          type: "done",
          jobs: uniqueJobs,
          totalFound: uniqueJobs.length,
          withEmail,
          withoutEmail: uniqueJobs.length - withEmail,
          blocksFound: blocks.length,
          pages: pages.length,
        });
      } catch (error) {
        console.error("PDF stream error:", error);
        send({ type: "error", error: error instanceof Error ? error.message : "Failed to process PDF" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Next.js App Router: increase body size limit for large PDF uploads
export const maxDuration = 300; // 5 min timeout for large PDFs
