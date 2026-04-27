import { NextRequest, NextResponse } from "next/server";
import { getActiveResumeAnalysis, getResumeAnalysisById, ResumeAnalysis } from "@/lib/resume-service";

interface ResumeProfile {
  name: string;
  skills: string[];
  experience: { title: string; company: string; duration: string }[];
  totalYearsExperience: number;
  topSkillCategories: string[];
}

interface JobData {
  jobTitle: string;
  company?: string;
  requiredSkills: string[];
  experienceRequired?: string;
}

interface AnalysisResult {
  matchScore: number;
  analysis: string;
  matchingSkills: string[];
  missingSkills: string[];
  experienceMatch: string;
  experienceNotes: string;
  recommendations: string[];
  interviewTips: string[];
}

/**
 * Simple skill matching without AI
 */
function analyzeSkillMatch(
  candidateSkills: string[],
  requiredSkills: string[],
  candidateExperience: number,
  requiredExperience?: string
): AnalysisResult {
  // Normalize skills for comparison
  const normalizeSkill = (s: string) => s.toLowerCase().trim();
  const candidateNormalized = new Set(candidateSkills.map(normalizeSkill));
  const requiredNormalized = requiredSkills.map(normalizeSkill);
  
  // Find matching and missing skills
  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];
  
  for (let i = 0; i < requiredSkills.length; i++) {
    const normalized = requiredNormalized[i];
    // Check for exact match or partial match
    const hasSkill = candidateNormalized.has(normalized) || 
      [...candidateNormalized].some(cs => cs.includes(normalized) || normalized.includes(cs));
    
    if (hasSkill) {
      matchingSkills.push(requiredSkills[i]);
    } else {
      missingSkills.push(requiredSkills[i]);
    }
  }
  
  // Calculate match score
  const skillScore = requiredSkills.length > 0 
    ? (matchingSkills.length / requiredSkills.length) * 100 
    : 50;
  
  // Parse experience requirement
  let experienceMatch = "moderate";
  let experienceNotes = "";
  
  if (requiredExperience) {
    const expMatch = requiredExperience.match(/(\d+)/);
    const requiredYears = expMatch ? parseInt(expMatch[1]) : 0;
    
    if (candidateExperience >= requiredYears) {
      experienceMatch = "strong";
      experienceNotes = `${candidateExperience} years experience meets ${requiredExperience} requirement`;
    } else if (candidateExperience >= requiredYears - 2) {
      experienceMatch = "moderate";
      experienceNotes = `${candidateExperience} years is slightly below ${requiredExperience} requirement`;
    } else {
      experienceMatch = "weak";
      experienceNotes = `${candidateExperience} years is below ${requiredExperience} requirement`;
    }
  } else {
    experienceNotes = `Candidate has ${candidateExperience} years of experience`;
  }
  
  // Adjust score based on experience
  let finalScore = skillScore;
  if (experienceMatch === "strong") finalScore = Math.min(100, finalScore + 10);
  if (experienceMatch === "weak") finalScore = Math.max(0, finalScore - 15);
  
  // Generate analysis
  const analysis = matchingSkills.length > 0
    ? `Candidate matches ${matchingSkills.length} of ${requiredSkills.length} required skills. ${experienceNotes}.`
    : `Limited skill overlap found. ${experienceNotes}.`;
  
  // Simple recommendations
  const recommendations: string[] = [];
  if (missingSkills.length > 0) {
    recommendations.push(`Consider learning: ${missingSkills.slice(0, 3).join(', ')}`);
  }
  if (experienceMatch === "weak") {
    recommendations.push("Highlight relevant project experience to compensate for years");
  }
  if (matchingSkills.length > 0) {
    recommendations.push(`Emphasize your strong skills: ${matchingSkills.slice(0, 3).join(', ')}`);
  }
  
  // Simple interview tips
  const interviewTips = [
    matchingSkills.length > 0 ? `Prepare examples using ${matchingSkills[0]}` : "Research the required technologies",
    "Prepare questions about the team and tech stack",
  ];
  
  return {
    matchScore: Math.round(finalScore),
    analysis,
    matchingSkills,
    missingSkills,
    experienceMatch,
    experienceNotes,
    recommendations,
    interviewTips,
  };
}

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
      }
      body = JSON.parse(text);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { 
      jobDescription, 
      jobData,
      resumeText, 
      resumeProfile, 
      profileId, 
      useStoredResume 
    } = body as {
      jobDescription?: string;
      jobData?: JobData;
      resumeText?: string;
      resumeProfile?: ResumeProfile;
      profileId?: string;
      useStoredResume?: boolean;
    };

    // Get job skills from either jobData or require jobDescription
    let requiredSkills: string[] = [];
    let experienceRequired: string | undefined;
    
    if (jobData) {
      requiredSkills = jobData.requiredSkills || [];
      experienceRequired = jobData.experienceRequired;
    } else if (!jobDescription) {
      return NextResponse.json({ error: "Either jobData or jobDescription is required" }, { status: 400 });
    }

    // Get stored resume analysis if requested or if no resume provided
    let storedAnalysis: ResumeAnalysis | null = null;
    
    if (profileId) {
      storedAnalysis = await getResumeAnalysisById(profileId);
      if (!storedAnalysis) {
        return NextResponse.json({ error: `Profile not found: ${profileId}` }, { status: 404 });
      }
      console.log(`Using stored profile: ${storedAnalysis.name} (ID: ${profileId})`);
    } else if (useStoredResume || (!resumeProfile && !resumeText)) {
      storedAnalysis = await getActiveResumeAnalysis();
      if (storedAnalysis) {
        console.log(`Using active stored profile: ${storedAnalysis.name} (ID: ${storedAnalysis.id})`);
      }
    }

    // Get candidate skills and experience
    let candidateSkills: string[] = [];
    let candidateExperience = 0;
    let resumeSource = 'none';
    
    if (resumeProfile) {
      candidateSkills = resumeProfile.skills || [];
      candidateExperience = resumeProfile.totalYearsExperience || 0;
      resumeSource = 'provided';
    } else if (storedAnalysis) {
      candidateSkills = storedAnalysis.skills || [];
      candidateExperience = storedAnalysis.totalYearsExperience || 0;
      resumeSource = 'database';
    }

    if (candidateSkills.length === 0) {
      return NextResponse.json({ 
        error: "No candidate skills found. Please provide resumeProfile or ensure a stored profile exists." 
      }, { status: 400 });
    }

    console.log(`Resume source: ${resumeSource}, Skills: ${candidateSkills.length}, Experience: ${candidateExperience}y`);

    // Perform skill-based analysis (no AI)
    const result = analyzeSkillMatch(
      candidateSkills,
      requiredSkills,
      candidateExperience,
      experienceRequired
    );

    return NextResponse.json({
      ...result,
      cached: false,
      resumeSource,
      profileId: storedAnalysis?.id,
      profileName: storedAnalysis?.name,
    });

  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
