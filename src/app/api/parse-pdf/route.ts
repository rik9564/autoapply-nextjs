import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
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

// gemma4:31b has 256K context (~200K usable tokens).
// 80K chars ≈ ~20K tokens — well within a single context window, minimising chunk splitting.
const CHUNK_SIZE = 80000;

async function parsePDF(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const { text } = await extractText(uint8Array);
  return Array.isArray(text) ? text.join("\n") : String(text);
}

function splitIntoChunks(text: string, chunkSize: number = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline > start + chunkSize * 0.5) {
        end = lastNewline + 1;
      }
    }
    
    chunks.push(text.slice(start, end));
    start = end;
  }
  
  return chunks;
}

function parseJobsFromResponse(content: string): ExtractedJob[] {
  // Try using the centralized JSON parser first
  const parsed = parseAIJSON<{ jobs: ExtractedJob[] } | ExtractedJob[]>(content);
  
  if (parsed) {
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if ('jobs' in parsed && Array.isArray(parsed.jobs)) {
      return parsed.jobs;
    }
  }
  
  // Fallback: Try regex extraction
  const jobPattern = /"jobTitle"\s*:\s*"([^"]+)"[\s\S]*?"recruiterName"\s*:\s*"([^"]*)"[\s\S]*?"recruiterEmail"\s*:\s*"([^"]*)"[\s\S]*?"recruiterPhone"\s*:\s*"([^"]*)"[\s\S]*?"jobDescription"\s*:\s*"([^"]*)"/g;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = jobPattern.exec(content)) !== null) {
    matches.push(match);
  }
  
  return matches.map(match => ({
    jobTitle: match[1] || "",
    recruiterName: match[2] || "Unknown",
    recruiterEmail: match[3] || "",
    recruiterPhone: match[4] || "",
    jobDescription: match[5] || "",
    company: "",
    location: "",
    workType: "unknown" as const,
    experienceLevel: "",
    salaryRange: "",
    skills: [],
    jobType: "unknown" as const,
  }));
}

const JOB_EXTRACTION_SYSTEM_PROMPT = `You are an expert job posting parser with deep understanding of recruitment documents.

Your task: Extract EVERY job posting found in the provided text with maximum accuracy.

For each job posting, extract these fields precisely:
- jobTitle: The exact job title as written
- recruiterName: Full name of the contact person, or "Unknown" if not found
- recruiterEmail: Email address — this is CRITICAL, search carefully
- recruiterPhone: Phone or mobile number including country code if present
- jobDescription: A clear 2-3 sentence summary capturing the role's purpose, key responsibilities and tech stack
- company: Company name — infer from email domain (e.g. @google.com → Google) or from text
- location: City/State/Country, "Remote", "Hybrid" or "" if not mentioned
- workType: exactly one of "remote", "hybrid", "onsite", "unknown"
- experienceLevel: e.g. "3-5 years", "Senior", "Entry-level", "10+ years"
- salaryRange: exact text if present, else ""
- skills: array of technical and soft skills mentioned — be thorough
- jobType: exactly one of "fulltime", "contract", "parttime", "internship", "unknown"

RULES:
1. Extract ALL jobs, even if they look similar — do not skip any
2. Output ONLY valid JSON, no markdown, no explanation
3. Escape all special characters inside string values
4. If no jobs found, return {"jobs":[]}

Required output format:
{"jobs":[{"jobTitle":"...","recruiterName":"...","recruiterEmail":"...","recruiterPhone":"...","jobDescription":"...","company":"...","location":"...","workType":"...","experienceLevel":"...","salaryRange":"...","skills":[...],"jobType":"..."}]}`;

async function extractJobsFromChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): Promise<ExtractedJob[]> {
  try {
    const response = await callAI({
      type: 'parse-pdf',
      systemPrompt: JOB_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: `Extract all job postings from the following text (chunk ${chunkIndex + 1} of ${totalChunks}):\n\n${chunk}`,
      temperature: 0.05, // Near-deterministic for structured extraction
      maxTokens: 16000,  // 31b can produce large JSON payloads reliably
    });

    const jobs = parseJobsFromResponse(response.content);
    console.log(`  Chunk ${chunkIndex + 1}/${totalChunks}: Found ${jobs.length} jobs (cached: ${response.cached})`);
    return jobs;
  } catch (error) {
    console.error(`  Chunk ${chunkIndex + 1} error:`, error);
    return [];
  }
}

function deduplicateJobs(jobs: ExtractedJob[]): ExtractedJob[] {
  const seen = new Map<string, ExtractedJob>();
  
  for (const job of jobs) {
    const key = job.recruiterEmail.toLowerCase() || `title:${job.jobTitle.toLowerCase()}`;
    
    if (!seen.has(key)) {
      seen.set(key, job);
    } else {
      const existing = seen.get(key)!;
      if (job.jobDescription.length > existing.jobDescription.length) {
        seen.set(key, job);
      }
    }
  }
  
  return Array.from(seen.values());
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let pdfText = "";
    try {
      pdfText = await parsePDF(buffer);
    } catch (pdfError) {
      console.error("PDF parsing error:", pdfError);
      return NextResponse.json({ error: "Failed to parse PDF file" }, { status: 400 });
    }

    if (!pdfText || pdfText.trim().length < 50) {
      return NextResponse.json({ error: "Could not extract text from PDF" }, { status: 400 });
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`PDF PROCESSING (Ollama): ${pdfText.length} characters extracted`);

    // Check if proxy is running using centralized health check
    const health = await checkProxyHealth();
    if (!health.ok) {
      console.error("Ollama proxy not running:", health.message);
      return NextResponse.json({
        jobs: [],
        rawText: pdfText.substring(0, 5000),
        message: health.message,
      });
    }

    // Split into chunks
    const chunks = splitIntoChunks(pdfText);
    console.log(`Split into ${chunks.length} chunks (~${CHUNK_SIZE} chars each)`);

    // Process all chunks
    const allJobs: ExtractedJob[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const jobs = await extractJobsFromChunk(chunks[i], i, chunks.length);
      allJobs.push(...jobs);
      
      // Small delay between chunks to be nice to the API
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`\nTotal jobs before deduplication: ${allJobs.length}`);
    
    // Deduplicate
    const uniqueJobs = deduplicateJobs(allJobs);
    console.log(`Unique jobs after deduplication: ${uniqueJobs.length}`);
    
    // Log jobs
    uniqueJobs.slice(0, 10).forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.jobTitle} | ${job.recruiterEmail || 'no email'} | ${job.company || 'unknown'}`);
    });
    if (uniqueJobs.length > 10) {
      console.log(`  ... and ${uniqueJobs.length - 10} more`);
    }
    console.log(`${"=".repeat(60)}\n`);

    if (uniqueJobs.length === 0) {
      return NextResponse.json({
        jobs: [],
        rawText: pdfText.substring(0, 5000),
        message: "No jobs found in PDF",
      });
    }

    return NextResponse.json({
      jobs: uniqueJobs,
      rawText: pdfText.substring(0, 5000),
      totalFound: uniqueJobs.length,
      textLength: pdfText.length,
      chunksProcessed: chunks.length,
    });

  } catch (error) {
    console.error("Parse PDF error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process PDF" },
      { status: 500 }
    );
  }
}
