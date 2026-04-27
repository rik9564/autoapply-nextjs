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

    const systemPrompt = `You are an expert resume parser. Extract structured information from the resume.

IMPORTANT: Calculate total years of experience by adding up ALL work experience durations.
- Jan 2022 to Present (January 2026) = 4 years
- July 2024 to Present = 1.5 years
- Add overlapping periods only once

Return ONLY valid JSON with this structure:
{
  "name": "Full name",
  "email": "email@example.com",
  "phone": "phone number or empty",
  "summary": "2-3 sentence professional summary",
  "skills": ["Skill1", "Skill2", ...up to 20 key skills],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "2 years" or "2020-2023",
      "highlights": ["Key achievement 1", "Key achievement 2"]
    }
  ],
  "education": [
    {
      "degree": "Degree name",
      "institution": "University/College",
      "year": "2020"
    }
  ],
  "totalYearsExperience": 4,
  "topSkillCategories": ["Programming", "Testing", "Cloud"] // 3-5 main areas
}

Be thorough in extracting skills - include programming languages, frameworks, tools, methodologies, soft skills.
No markdown, just JSON.`;

    const userPrompt = `Parse this resume:\n\n${resumeText.substring(0, 15000)}`;

    try {
      // Use AI service with caching
      const response = await callAI({
        type: 'parse-resume',
        systemPrompt,
        userPrompt,
        temperature: 0.2,
        maxTokens: 4000,
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
