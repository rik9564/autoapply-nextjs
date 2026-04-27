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

const CHUNK_SIZE = 15000;

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

const JOB_EXTRACTION_SYSTEM_PROMPT = `You are a job posting parser. Extract ALL job postings from this text.

For each job extract:
- jobTitle: exact title
- recruiterName: contact person name or "Unknown"
- recruiterEmail: email address (VERY IMPORTANT)
- recruiterPhone: phone/mobile number
- jobDescription: 1-2 sentence summary
- company: infer from email domain or text
- location: city/state or "Remote" or ""
- workType: "remote", "hybrid", "onsite", or "unknown"
- experienceLevel: e.g., "3-5 years", "Senior"
- salaryRange: if mentioned, else ""
- skills: array of key skills
- jobType: "fulltime", "contract", "internship", or "unknown"

Return ONLY valid JSON:
{"jobs":[{"jobTitle":"...","recruiterName":"...","recruiterEmail":"...","recruiterPhone":"...","jobDescription":"...","company":"...","location":"...","workType":"...","experienceLevel":"...","salaryRange":"...","skills":[...],"jobType":"..."}]}

No markdown. If no jobs: {"jobs":[]}`;

async function extractJobsFromChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): Promise<ExtractedJob[]> {
  try {
    const response = await callAI({
      type: 'parse-pdf',
      systemPrompt: JOB_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: `Chunk ${chunkIndex + 1}/${totalChunks}. Extract jobs:\n\n${chunk}`,
      temperature: 0.1,
      maxTokens: 4000,
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
