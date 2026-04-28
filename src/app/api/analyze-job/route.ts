import { NextRequest, NextResponse } from "next/server";
import { groqChatWithRetry, parseGroqJSON, ANALYSIS_MODEL } from "@/lib/groq";
import type { Job, ResumeProfile } from "@/types";

interface AnalysisResult {
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  experienceMatch: "strong" | "moderate" | "weak" | "unknown";
  experienceNotes: string;
  recommendations: string[];
  interviewTips: string[];
  aiAnalysis: string;
}

const SYSTEM_PROMPT = `You are a senior technical recruiter and career coach analyzing job fit.

Given a job posting and a candidate profile, analyze the match and return a JSON object.

Return this exact structure:
{
  "matchScore": <0-100 integer>,
  "matchingSkills": ["skill1", "skill2", ...],
  "missingSkills": ["skill1", "skill2", ...],
  "experienceMatch": "strong" | "moderate" | "weak" | "unknown",
  "experienceNotes": "<1 sentence explaining experience fit>",
  "recommendations": ["<actionable tip 1>", "<actionable tip 2>", "<actionable tip 3>"],
  "interviewTips": ["<interview prep tip 1>", "<interview prep tip 2>"],
  "aiAnalysis": "<2-3 sentence overall assessment>"
}

matchScore rules:
- 80-100: Strong match — candidate meets most requirements
- 60-79: Good match — candidate meets core requirements, some gaps
- 40-59: Moderate match — notable gaps but transferable skills exist
- 0-39: Weak match — significant skill/experience gaps

Output ONLY valid JSON. No markdown, no explanation.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const job: Job = body.job;
    const profile: ResumeProfile | null = body.profile ?? null;

    if (!job) {
      return NextResponse.json({ error: "No job provided" }, { status: 400 });
    }

    const candidateSection = profile
      ? `CANDIDATE PROFILE:
Name: ${profile.name}
Total experience: ${profile.totalYearsExperience} years
Skills: ${profile.skills.join(", ")}
Top skill areas: ${profile.topSkillCategories.join(", ")}
Summary: ${profile.summary}
Recent roles: ${profile.experience
          .slice(0, 3)
          .map((e) => `${e.title} at ${e.company} (${e.duration})`)
          .join("; ")}`
      : "CANDIDATE PROFILE: Not provided (assess based on job requirements only)";

    const jobSection = `JOB POSTING:
Title: ${job.jobTitle}
Company: ${job.company ?? "Unknown"}
Location: ${job.location ?? "Unknown"}
Experience required: ${job.experienceLevel ?? "Not specified"}
Work type: ${job.workType ?? "Unknown"}
Job type: ${job.jobType ?? "Unknown"}
Skills required: ${job.skills?.join(", ") ?? "Not listed"}
Description: ${job.jobDescription}`;

    const completion = await groqChatWithRetry({
      model: ANALYSIS_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${candidateSection}\n\n${jobSection}` },
      ],
      temperature: 0.15,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const result = parseGroqJSON<AnalysisResult>(content);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to parse analysis response" },
        { status: 500 }
      );
    }

    // Clamp matchScore to 0-100
    result.matchScore = Math.max(0, Math.min(100, Math.round(result.matchScore)));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analyze job error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze job" },
      { status: 500 }
    );
  }
}
