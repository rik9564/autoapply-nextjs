import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
import { callAI, parseAIJSON } from "@/lib/ai-service";
import { 
  storeResumeAnalysis, 
  getStoredAnalysisByHash, 
  generateResumeHash,
  getActiveResumeAnalysis 
} from "@/lib/resume-service";

interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  summary: string;
  skills: string[];
  experience: {
    title: string;
    company: string;
    duration: string;
    highlights: string[];
  }[];
  education: {
    degree: string;
    institution: string;
    year: string;
  }[];
  totalYearsExperience: number;
  topSkillCategories: string[];
}

async function parsePDF(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const { text } = await extractText(uint8Array);
  return Array.isArray(text) ? text.join("\n") : String(text);
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

    let resumeText = "";
    
    // Check if it's a PDF
    if (file.name.toLowerCase().endsWith('.pdf')) {
      try {
        resumeText = await parsePDF(buffer);
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError);
        return NextResponse.json({ error: "Failed to parse PDF" }, { status: 400 });
      }
    } else {
      // Assume text file
      resumeText = buffer.toString('utf-8');
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json({ error: "Could not extract text from resume" }, { status: 400 });
    }

    console.log(`\nResume text extracted: ${resumeText.length} characters`);

    // Check if we already have this resume analyzed
    const resumeHash = generateResumeHash(resumeText);
    const existingAnalysis = await getStoredAnalysisByHash(resumeHash);
    
    if (existingAnalysis) {
      console.log(`\nUsing cached resume analysis (ID: ${existingAnalysis.id})`);
      return NextResponse.json({
        success: true,
        profile: {
          name: existingAnalysis.name,
          email: existingAnalysis.email,
          phone: existingAnalysis.phone,
          summary: existingAnalysis.summary,
          skills: existingAnalysis.skills,
          experience: existingAnalysis.experience,
          education: existingAnalysis.education,
          totalYearsExperience: existingAnalysis.totalYearsExperience,
          topSkillCategories: existingAnalysis.topSkillCategories,
        },
        profileId: existingAnalysis.id,
        rawText: resumeText,
        cached: true,
        fromDatabase: true,
      });
    }

    const systemPrompt = `You are a world-class resume parser with deep expertise in software engineering, data science, and technology roles.

Your goal is to extract a complete and accurate structured profile from the resume text provided.

EXPERIENCE CALCULATION RULES:
- Calculate totalYearsExperience by summing ALL unique work periods (do not double-count overlapping roles)
- "Present" means today: April 2026
- Example: Jan 2022 – Present = 4.3 years; Jul 2024 – Present = 1.75 years
- Round to one decimal place

SKILLS EXTRACTION:
- Be exhaustive — extract ALL technical skills: languages, frameworks, libraries, cloud platforms, databases, tools, CI/CD, methodologies, soft skills
- Include skills implied by job descriptions even if not listed explicitly in a skills section
- Aim for 30+ skills if the resume supports it

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "name": "Full name",
  "email": "email@example.com",
  "phone": "phone number or empty string",
  "summary": "3-4 sentence professional summary highlighting seniority, core strengths and key achievements",
  "skills": ["Skill1", "Skill2", "..."],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Jan 2022 – Present (4.3 years)",
      "highlights": ["Quantified achievement 1", "Achievement 2", "Achievement 3"]
    }
  ],
  "education": [
    {
      "degree": "Degree name and field",
      "institution": "University/College name",
      "year": "2020"
    }
  ],
  "totalYearsExperience": 4.3,
  "topSkillCategories": ["Backend Engineering", "Cloud Infrastructure", "Testing"] 
}

topSkillCategories should be 3-5 broad areas that best describe the candidate's expertise.`;

    // Pass up to 60K chars — well within gemma4:31b's 256K context window
    const userPrompt = `Parse this resume and return the structured JSON profile:\n\n${resumeText.substring(0, 60000)}`;

    try {
      // Use AI service with caching
      const response = await callAI({
        type: 'parse-resume',
        systemPrompt,
        userPrompt,
        temperature: 0.1, // Low temp for deterministic structured extraction
        maxTokens: 8000,  // Plenty of room for a full rich profile
      });

      console.log(`\nAI Response (first 500 chars): ${response.content.substring(0, 500)}`);

      const parsed = parseAIJSON<ParsedResume>(response.content);

      if (parsed) {
        console.log(`\nResume parsed successfully:`);
        console.log(`  Name: ${parsed.name}`);
        console.log(`  Skills: ${parsed.skills?.length || 0} extracted`);
        console.log(`  Experience: ${parsed.experience?.length || 0} positions`);
        console.log(`  Total Years: ${parsed.totalYearsExperience}`);
        console.log(`  Cached: ${response.cached}`);

        // Store the analysis in database for future use
        try {
          const storedAnalysis = await storeResumeAnalysis(parsed, resumeText);
          console.log(`  Stored with ID: ${storedAnalysis.id}`);

          return NextResponse.json({
            success: true,
            profile: parsed,
            profileId: storedAnalysis.id,
            rawText: resumeText,
            cached: response.cached,
            storedInDatabase: true,
          });
        } catch (storeError) {
          console.error('Failed to store analysis:', storeError);
          // Still return success, just without database storage
          return NextResponse.json({
            success: true,
            profile: parsed,
            rawText: resumeText,
            cached: response.cached,
            storedInDatabase: false,
          });
        }
      }

      return NextResponse.json({
        error: "Failed to parse AI response",
        rawText: resumeText.substring(0, 2000)
      }, { status: 500 });

    } catch (aiError) {
      console.error("AI service error:", aiError);
      return NextResponse.json({
        error: aiError instanceof Error ? aiError.message : "AI parsing failed",
        rawText: resumeText.substring(0, 2000)
      }, { status: 500 });
    }

  } catch (error) {
    console.error("Parse resume error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process resume" },
      { status: 500 }
    );
  }
}
