import { NextRequest, NextResponse } from "next/server";
import { callAI, parseAIJSON, checkProxyHealth } from "@/lib/ai-service";

interface ExtractedJob {
  jobTitle: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string;
  jobDescription: string;
  company?: string;
  location?: string;
  workType?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  experienceLevel?: string;
  salaryRange?: string;
  skills?: string[];
  jobType?: 'fulltime' | 'contract' | 'parttime' | 'internship' | 'unknown';
}

// Job Curator separator pattern
const JOB_SEPARATOR = /={5,}/;

// Noise patterns from Job Curator channel headers/footers
const NOISE_PATTERNS = [
  /Shared by Job Curator[^\n]*/gi,
  /Join us on Telegram[^\n]*/gi,
  /t\.me\/[^\s\n]*/gi,
  /https?:\/\/t\.me[^\s\n]*/gi,
  /Join our (channel|group|community)[^\n]*/gi,
  /For more (jobs|opportunities)[^\n]*/gi,
  /Follow us[^\n]*/gi,
  /Subscribe[^\n]*/gi,
];

// How many job listing blocks to send per AI call (balance throughput vs context)
const JOBS_PER_CHUNK = 10;

function stripNoise(text: string): string {
  let cleaned = text;
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Collapse excessive blank lines
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
  return cleaned.trim();
}

function splitJobBlocks(text: string): string[] {
  // Split on separator lines (5+ equals signs)
  const blocks = text.split(JOB_SEPARATOR);

  // Filter out empty/noise-only blocks
  return blocks
    .map(b => b.trim())
    .filter(b => b.length > 30); // At least 30 chars to be a real listing
}

function batchBlocks(blocks: string[], batchSize: number): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < blocks.length; i += batchSize) {
    batches.push(blocks.slice(i, i + batchSize));
  }
  return batches;
}

function parseJobsFromResponse(content: string): ExtractedJob[] {
  const parsed = parseAIJSON<{ jobs: ExtractedJob[] } | ExtractedJob[]>(content);

  if (parsed) {
    if (Array.isArray(parsed)) return parsed;
    if ('jobs' in parsed && Array.isArray(parsed.jobs)) return parsed.jobs;
  }

  // Fallback regex
  const jobPattern = /"jobTitle"\s*:\s*"([^"]+)"/g;
  const titles: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = jobPattern.exec(content)) !== null) {
    titles.push(m[1]);
  }
  console.warn(`  Regex fallback found ${titles.length} job titles`);
  return [];
}

const JOB_EXTRACTION_SYSTEM_PROMPT = `You are an expert job posting parser for Indian IT job listings.

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

async function extractJobsFromBatch(
  batch: string[],
  batchIndex: number,
  totalBatches: number
): Promise<ExtractedJob[]> {
  const combinedText = batch
    .map((b, i) => `--- JOB LISTING ${i + 1} ---\n${b}`)
    .join('\n\n');

  try {
    const response = await callAI({
      type: 'parse-jobs-text',
      systemPrompt: JOB_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: `Extract all job postings from these ${batch.length} listings (batch ${batchIndex + 1} of ${totalBatches}):\n\n${combinedText}`,
      temperature: 0.05,
      maxTokens: 16000,
    });

    const jobs = parseJobsFromResponse(response.content);
    console.log(`  Batch ${batchIndex + 1}/${totalBatches}: Found ${jobs.length} jobs (cached: ${response.cached})`);
    return jobs;
  } catch (error) {
    console.error(`  Batch ${batchIndex + 1} error:`, error);
    return [];
  }
}

function deduplicateJobs(jobs: ExtractedJob[]): ExtractedJob[] {
  const seen = new Map<string, ExtractedJob>();

  for (const job of jobs) {
    const key = job.recruiterEmail
      ? `${job.recruiterEmail.toLowerCase()}|${job.jobTitle.toLowerCase().substring(0, 30)}`
      : `noemail:${job.jobTitle.toLowerCase()}`;

    if (!seen.has(key)) {
      seen.set(key, job);
    } else {
      // Keep the more complete entry
      const existing = seen.get(key)!;
      const score = (j: ExtractedJob) =>
        (j.jobDescription?.length || 0) +
        (j.skills?.length || 0) * 10 +
        (j.recruiterEmail ? 20 : 0) +
        (j.company ? 5 : 0);
      if (score(job) > score(existing)) {
        seen.set(key, job);
      }
    }
  }

  return Array.from(seen.values());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawText: string = body.text || '';

    if (!rawText.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`EXTRACT JOBS FROM TEXT: ${rawText.length} characters`);

    // Health check
    const health = await checkProxyHealth();
    if (!health.ok) {
      console.error("Ollama not running:", health.message);
      return NextResponse.json({ jobs: [], message: health.message });
    }

    // 1. Strip noise
    const cleaned = stripNoise(rawText);
    console.log(`  After noise stripping: ${cleaned.length} chars`);

    // 2. Split into individual job blocks
    const blocks = splitJobBlocks(cleaned);
    console.log(`  Job blocks found: ${blocks.length}`);

    if (blocks.length === 0) {
      return NextResponse.json({
        jobs: [],
        message: "No job listings found. Make sure the text contains job postings separated by ===== lines.",
        totalFound: 0,
      });
    }

    // 3. Batch blocks for AI processing
    const batches = batchBlocks(blocks, JOBS_PER_CHUNK);
    console.log(`  Processing in ${batches.length} batches of up to ${JOBS_PER_CHUNK} jobs each`);

    // 4. Extract jobs from each batch
    const allJobs: ExtractedJob[] = [];
    for (let i = 0; i < batches.length; i++) {
      const jobs = await extractJobsFromBatch(batches[i], i, batches.length);
      allJobs.push(...jobs);

      // Small delay between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`  Total jobs before dedup: ${allJobs.length}`);

    // 5. Deduplicate
    const uniqueJobs = deduplicateJobs(allJobs);
    console.log(`  Unique jobs after dedup: ${uniqueJobs.length}`);

    const withEmail = uniqueJobs.filter(j => j.recruiterEmail).length;
    const withoutEmail = uniqueJobs.length - withEmail;

    console.log(`  With email: ${withEmail}, Without email: ${withoutEmail}`);
    uniqueJobs.slice(0, 10).forEach((job, i) => {
      console.log(`    ${i + 1}. ${job.jobTitle} @ ${job.company || '?'} | ${job.recruiterEmail || 'no email'}`);
    });
    if (uniqueJobs.length > 10) {
      console.log(`    ... and ${uniqueJobs.length - 10} more`);
    }
    console.log(`${"=".repeat(60)}\n`);

    return NextResponse.json({
      jobs: uniqueJobs,
      totalFound: uniqueJobs.length,
      withEmail,
      withoutEmail,
      blocksFound: blocks.length,
      batchesProcessed: batches.length,
    });

  } catch (error) {
    console.error("Extract jobs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to extract jobs" },
      { status: 500 }
    );
  }
}
