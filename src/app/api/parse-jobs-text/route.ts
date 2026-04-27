import { NextRequest, NextResponse } from "next/server";

// Internal job format used by the application
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

// Input can have various field names - we handle all variations
interface InputJob {
  // Position/Role variations
  position?: string;
  job_title?: string;
  jobTitle?: string;
  title?: string;
  role?: string;
  designation?: string;
  
  // Company variations
  company_name?: string;
  company?: string;
  companyName?: string;
  organization?: string;
  employer?: string;
  
  // Location variations
  location?: string;
  city?: string;
  address?: string;
  place?: string;
  
  // Experience variations
  experience?: string;
  exp?: string;
  experience_required?: string;
  years_of_experience?: string;
  yoe?: string;
  
  // Skills variations
  skills?: string[] | string;
  required_skills?: string[] | string;
  tech_stack?: string[] | string;
  technologies?: string[] | string;
  
  // Email variations - MOST IMPORTANT
  contact_email?: string | null;
  email?: string | null;
  hr_email?: string | null;
  recruiter_email?: string | null;
  hiring_manager_email?: string | null;
  apply_email?: string | null;
  
  // Phone variations
  contact_phone?: string | null;
  phone?: string | null;
  mobile?: string | null;
  contact_number?: string | null;
  
  // Name variations
  contact_name?: string | null;
  name?: string | null;
  hr_name?: string | null;
  recruiter_name?: string | null;
  hiring_manager?: string | null;
  contact_person?: string | null;
  
  // Work mode variations
  work_mode?: string | null;
  workMode?: string | null;
  work_type?: string | null;
  workType?: string | null;
  remote?: boolean | string | null;
  
  // Salary variations
  salary?: string | null;
  salary_range?: string | null;
  compensation?: string | null;
  ctc?: string | null;
  package?: string | null;
  
  // Job type variations
  job_type?: string | null;
  jobType?: string | null;
  employment_type?: string | null;
  type?: string | null;
  
  // Any other fields that might contain useful info
  description?: string | null;
  job_description?: string | null;
  details?: string | null;
  requirements?: string | null;
  
  // Allow any additional fields
  [key: string]: unknown;
}

// Email regex pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

function extractEmailFromString(str: string | null | undefined): string | null {
  if (!str || typeof str !== 'string') return null;
  const matches = str.match(EMAIL_REGEX);
  return matches ? matches[0].toLowerCase() : null;
}

function extractAllEmailsFromObject(obj: Record<string, unknown>): string[] {
  const emails: Set<string> = new Set();
  
  function searchValue(val: unknown) {
    if (typeof val === 'string') {
      const found = val.match(EMAIL_REGEX);
      if (found) {
        found.forEach(e => emails.add(e.toLowerCase()));
      }
    } else if (Array.isArray(val)) {
      val.forEach(searchValue);
    } else if (val && typeof val === 'object') {
      Object.values(val).forEach(searchValue);
    }
  }
  
  searchValue(obj);
  return Array.from(emails);
}

function normalizeWorkMode(workMode: string | boolean | null | undefined): ExtractedJob['workType'] {
  if (workMode === null || workMode === undefined) return 'unknown';
  
  if (typeof workMode === 'boolean') {
    return workMode ? 'remote' : 'onsite';
  }
  
  const mode = String(workMode).toLowerCase();
  if (mode.includes('remote') || mode === 'wfh' || mode === 'work from home') return 'remote';
  if (mode.includes('hybrid')) return 'hybrid';
  if (mode.includes('onsite') || mode.includes('on-site') || mode.includes('on site') || mode === 'wfo' || mode === 'office') return 'onsite';
  return 'unknown';
}

function normalizeJobType(jobType: string | null | undefined): ExtractedJob['jobType'] {
  if (!jobType) return 'unknown';
  const type = jobType.toLowerCase();
  if (type.includes('full') || type.includes('permanent') || type.includes('fte')) return 'fulltime';
  if (type.includes('contract') || type.includes('c2c') || type.includes('c2h')) return 'contract';
  if (type.includes('part')) return 'parttime';
  if (type.includes('intern')) return 'internship';
  return 'unknown';
}

function normalizeSkills(skills: unknown): string[] {
  if (!skills) return [];
  
  if (Array.isArray(skills)) {
    return skills.map(s => String(s).trim()).filter(s => s.length > 0);
  }
  
  if (typeof skills === 'string') {
    // Try to split by common delimiters
    return skills.split(/[,;|\/]/).map(s => s.trim()).filter(s => s.length > 0);
  }
  
  return [];
}

interface MappingResult {
  job: ExtractedJob | null;
  warnings: string[];
  skipped: boolean;
  skipReason?: string;
}

function mapInputToExtracted(input: InputJob, index: number): MappingResult {
  const warnings: string[] = [];
  const jobNum = index + 1;
  
  // === Extract Job Title ===
  const jobTitle = (
    input.position ||
    input.job_title ||
    input.jobTitle ||
    input.title ||
    input.role ||
    input.designation ||
    ''
  ).toString().trim();
  
  if (!jobTitle) {
    return {
      job: null,
      warnings: [],
      skipped: true,
      skipReason: `Job ${jobNum}: No position/title found`
    };
  }
  
  // === Extract Email - CRITICAL ===
  // Try all common email field names first
  let recruiterEmail = (
    input.contact_email ||
    input.email ||
    input.hr_email ||
    input.recruiter_email ||
    input.hiring_manager_email ||
    input.apply_email ||
    ''
  );
  
  // Clean up the email
  if (recruiterEmail && typeof recruiterEmail === 'string') {
    recruiterEmail = recruiterEmail.trim().toLowerCase();
    // Validate it's actually an email
    if (!EMAIL_REGEX.test(recruiterEmail)) {
      // Try to extract email from the string
      const extracted = extractEmailFromString(recruiterEmail);
      if (extracted) {
        recruiterEmail = extracted;
      } else {
        recruiterEmail = '';
      }
    }
  } else {
    recruiterEmail = '';
  }
  
  // If still no email, search entire object for any email
  if (!recruiterEmail) {
    const allEmails = extractAllEmailsFromObject(input as Record<string, unknown>);
    if (allEmails.length > 0) {
      recruiterEmail = allEmails[0];
      warnings.push(`Job ${jobNum}: Email extracted from object scan: ${recruiterEmail}`);
    }
  }
  
  // Log warning if no email found - but still add the job!
  if (!recruiterEmail) {
    warnings.push(`Job ${jobNum} (${jobTitle}): No email found - job will be added but cannot apply`);
  }
  
  // === Extract Company ===
  const company = (
    input.company_name ||
    input.company ||
    input.companyName ||
    input.organization ||
    input.employer ||
    ''
  ).toString().trim();
  
  // === Extract Contact Name ===
  const recruiterName = (
    input.contact_name ||
    input.name ||
    input.hr_name ||
    input.recruiter_name ||
    input.hiring_manager ||
    input.contact_person ||
    'Hiring Manager'
  ).toString().trim() || 'Hiring Manager';
  
  // === Extract Phone ===
  const recruiterPhone = (
    input.contact_phone ||
    input.phone ||
    input.mobile ||
    input.contact_number ||
    ''
  ).toString().trim();
  
  // === Extract Location ===
  const location = (
    input.location ||
    input.city ||
    input.address ||
    input.place ||
    ''
  ).toString().trim();
  
  // === Extract Experience ===
  const experienceLevel = (
    input.experience ||
    input.exp ||
    input.experience_required ||
    input.years_of_experience ||
    input.yoe ||
    ''
  ).toString().trim();
  
  // === Extract Salary ===
  const salaryRange = (
    input.salary ||
    input.salary_range ||
    input.compensation ||
    input.ctc ||
    input.package ||
    ''
  ).toString().trim();
  
  // === Extract Skills ===
  const skills = normalizeSkills(
    input.skills ||
    input.required_skills ||
    input.tech_stack ||
    input.technologies
  );
  
  // === Extract Work Mode ===
  const workType = normalizeWorkMode(
    input.work_mode ||
    input.workMode ||
    input.work_type ||
    input.workType ||
    input.remote
  );
  
  // === Extract Job Type ===
  const jobType = normalizeJobType(
    input.job_type ||
    input.jobType ||
    input.employment_type ||
    input.type
  );
  
  // === Build Description ===
  const descriptionParts: string[] = [];
  if (input.description) descriptionParts.push(String(input.description));
  if (input.job_description) descriptionParts.push(String(input.job_description));
  if (input.details) descriptionParts.push(String(input.details));
  if (input.requirements) descriptionParts.push(String(input.requirements));
  
  let jobDescription = descriptionParts.join('\n\n').trim();
  
  // If no description, create a summary
  if (!jobDescription) {
    const parts = [`${jobTitle} at ${company || 'Company'}`];
    if (experienceLevel) parts.push(`Experience: ${experienceLevel}`);
    if (skills.length > 0) parts.push(`Skills: ${skills.join(', ')}`);
    if (location) parts.push(`Location: ${location}`);
    if (workType !== 'unknown') parts.push(`Work Mode: ${workType}`);
    jobDescription = parts.join('. ') + '.';
  }

  return {
    job: {
      jobTitle,
      recruiterName,
      recruiterEmail,
      recruiterPhone,
      jobDescription,
      company,
      location,
      workType,
      experienceLevel,
      salaryRange,
      skills,
      jobType,
    },
    warnings,
    skipped: false
  };
}

function deduplicateJobs(jobs: ExtractedJob[]): { unique: ExtractedJob[]; duplicateCount: number } {
  const seen = new Map<string, ExtractedJob>();
  let duplicateCount = 0;
  
  for (const job of jobs) {
    // Use email + title as key for better deduplication
    // This allows same email with different positions
    const key = job.recruiterEmail 
      ? `${job.recruiterEmail}|${job.jobTitle.toLowerCase().substring(0, 30)}`
      : `notitle:${job.jobTitle.toLowerCase()}`;
    
    if (!seen.has(key)) {
      seen.set(key, job);
    } else {
      duplicateCount++;
      // Keep the one with more complete information
      const existing = seen.get(key)!;
      const newScore = 
        (job.jobDescription?.length || 0) + 
        (job.skills?.length || 0) * 10 +
        (job.company ? 5 : 0) +
        (job.location ? 3 : 0) +
        (job.recruiterEmail ? 20 : 0);
      const existingScore = 
        (existing.jobDescription?.length || 0) + 
        (existing.skills?.length || 0) * 10 +
        (existing.company ? 5 : 0) +
        (existing.location ? 3 : 0) +
        (existing.recruiterEmail ? 20 : 0);
      
      if (newScore > existingScore) {
        seen.set(key, job);
      }
    }
  }
  
  return { unique: Array.from(seen.values()), duplicateCount };
}

export async function POST(request: NextRequest) {
  try {
    const rawText = await request.text();
    console.log(`\n${"=".repeat(60)}`);
    console.log(`JOBS IMPORT: Received request`);
    console.log(`  Raw body length: ${rawText.length}`);
    console.log(`  First 300 chars: ${rawText.substring(0, 300)}`);
    
    let body;
    try {
      body = JSON.parse(rawText);
    } catch (parseErr) {
      console.log(`  JSON parse error:`, parseErr);
      return NextResponse.json({ 
        error: "Invalid JSON in request body",
        hint: "Make sure you're sending valid JSON"
      }, { status: 400 });
    }
    
    console.log(`  Body type: ${typeof body}, isArray: ${Array.isArray(body)}`);
    
    // Accept multiple formats:
    // 1. Direct array: [{ position: ..., contact_email: ... }, ...]
    // 2. Wrapped in jobs: { jobs: [...] }
    // 3. Wrapped in data: { data: [...] }
    // 4. Wrapped in text as string (legacy): { text: "[...]" }
    // 5. Single job object: { position: ..., contact_email: ... }
    let inputJobs: InputJob[];
    
    if (Array.isArray(body)) {
      // Direct array: [{ position: ..., contact_email: ... }, ...]
      inputJobs = body;
    } else if (body && typeof body === 'object') {
      if (Array.isArray(body.jobs)) {
        // Wrapped format: { jobs: [...] }
        inputJobs = body.jobs;
      } else if (Array.isArray(body.data)) {
        // Wrapped format: { data: [...] }
        inputJobs = body.data;
      } else if (Array.isArray(body.results)) {
        // Wrapped format: { results: [...] }
        inputJobs = body.results;
      } else if (typeof body.text === 'string') {
        // Legacy format: { text: "[json array as string]" }
        console.log(`  Detected legacy format with 'text' property, parsing inner JSON...`);
        try {
          const parsed = JSON.parse(body.text);
          if (Array.isArray(parsed)) {
            inputJobs = parsed;
          } else if (parsed && typeof parsed === 'object') {
            // Single job in text
            inputJobs = [parsed];
          } else {
            return NextResponse.json({ 
              error: "The 'text' property must contain a JSON array or object",
            }, { status: 400 });
          }
        } catch (innerParseErr) {
          console.log(`  Failed to parse inner JSON from 'text':`, innerParseErr);
          return NextResponse.json({ 
            error: "Failed to parse JSON from 'text' property",
            hint: "The 'text' property should contain a valid JSON array"
          }, { status: 400 });
        }
      } else if (body.position || body.job_title || body.title || body.role) {
        // Single job object
        inputJobs = [body];
      } else {
        // Try to find an array property
        const arrayProps = Object.keys(body).filter(k => Array.isArray(body[k]));
        if (arrayProps.length > 0) {
          console.log(`  Found array property: ${arrayProps[0]}`);
          inputJobs = body[arrayProps[0]];
        } else {
          console.log(`  Invalid format. Keys in body:`, Object.keys(body));
          return NextResponse.json({ 
            error: "Invalid request: expected array of jobs or { jobs: [...] }",
            hint: "Send either a JSON array directly or an object with a 'jobs' array property",
            receivedKeys: Object.keys(body)
          }, { status: 400 });
        }
      }
    } else {
      return NextResponse.json({ 
        error: "Invalid request body format",
        hint: "Send a JSON array of jobs or an object containing jobs"
      }, { status: 400 });
    }

    if (inputJobs.length === 0) {
      return NextResponse.json({
        jobs: [],
        message: "No jobs provided in the request",
        totalFound: 0,
      });
    }

    console.log(`JOBS IMPORT: ${inputJobs.length} jobs received`);

    // Map and validate each job
    const validJobs: ExtractedJob[] = [];
    const allWarnings: string[] = [];
    const skippedReasons: string[] = [];
    let jobsWithoutEmail = 0;
    
    for (let i = 0; i < inputJobs.length; i++) {
      const result = mapInputToExtracted(inputJobs[i], i);
      
      if (result.skipped) {
        skippedReasons.push(result.skipReason || `Job ${i + 1}: Unknown reason`);
      } else if (result.job) {
        validJobs.push(result.job);
        if (!result.job.recruiterEmail) {
          jobsWithoutEmail++;
        }
      }
      
      allWarnings.push(...result.warnings);
    }

    // Log warnings
    if (allWarnings.length > 0) {
      console.log(`\n  ⚠️ WARNINGS:`);
      allWarnings.forEach(w => console.log(`    ${w}`));
    }
    
    if (skippedReasons.length > 0) {
      console.log(`\n  ❌ SKIPPED JOBS:`);
      skippedReasons.slice(0, 10).forEach(r => console.log(`    ${r}`));
      if (skippedReasons.length > 10) {
        console.log(`    ... and ${skippedReasons.length - 10} more`);
      }
    }

    console.log(`\n  Valid jobs after validation: ${validJobs.length}`);
    console.log(`  Jobs with email: ${validJobs.length - jobsWithoutEmail}`);
    console.log(`  Jobs without email: ${jobsWithoutEmail}`);
    
    // Deduplicate
    const { unique: uniqueJobs, duplicateCount } = deduplicateJobs(validJobs);
    console.log(`  Unique jobs after deduplication: ${uniqueJobs.length} (${duplicateCount} duplicates removed)`);
    
    // Separate jobs with and without email for reporting
    const jobsWithEmail = uniqueJobs.filter(j => j.recruiterEmail);
    const jobsNoEmail = uniqueJobs.filter(j => !j.recruiterEmail);
    
    // Log summary
    console.log(`\n  📊 SUMMARY:`);
    console.log(`    Total received: ${inputJobs.length}`);
    console.log(`    Skipped (no title): ${skippedReasons.length}`);
    console.log(`    Valid: ${validJobs.length}`);
    console.log(`    After dedup: ${uniqueJobs.length}`);
    console.log(`    With email (can apply): ${jobsWithEmail.length}`);
    console.log(`    Without email (view only): ${jobsNoEmail.length}`);
    
    // Log first few jobs with emails
    console.log(`\n  📧 JOBS WITH EMAIL (first 15):`);
    jobsWithEmail.slice(0, 15).forEach((job, i) => {
      console.log(`    ${i + 1}. ${job.jobTitle} @ ${job.company || '?'} | ${job.recruiterEmail} | ${job.workType} | ${job.skills?.slice(0, 3).join(', ') || 'no skills'}`);
    });
    if (jobsWithEmail.length > 15) {
      console.log(`    ... and ${jobsWithEmail.length - 15} more with email`);
    }
    
    if (jobsNoEmail.length > 0) {
      console.log(`\n  ⚠️ JOBS WITHOUT EMAIL (first 5):`);
      jobsNoEmail.slice(0, 5).forEach((job, i) => {
        console.log(`    ${i + 1}. ${job.jobTitle} @ ${job.company || '?'}`);
      });
    }
    
    console.log(`${"=".repeat(60)}\n`);

    if (uniqueJobs.length === 0) {
      return NextResponse.json({
        jobs: [],
        message: "No valid jobs found. Each job must have at least a position/title.",
        totalReceived: inputJobs.length,
        skipped: skippedReasons.length,
        totalFound: 0,
        warnings: allWarnings.slice(0, 10),
      });
    }

    return NextResponse.json({
      jobs: uniqueJobs,
      totalReceived: inputJobs.length,
      skipped: skippedReasons.length,
      duplicatesRemoved: duplicateCount,
      totalFound: uniqueJobs.length,
      withEmail: jobsWithEmail.length,
      withoutEmail: jobsNoEmail.length,
      warnings: allWarnings.length > 0 ? allWarnings.slice(0, 20) : undefined,
    });

  } catch (error) {
    console.error("Parse jobs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse jobs" },
      { status: 500 }
    );
  }
}
