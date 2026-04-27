import { NextRequest, NextResponse } from "next/server";
import { 
  getActiveResumeAnalysis, 
  getResumeAnalysisById,
  listResumeAnalyses,
  deleteResumeAnalysis 
} from "@/lib/resume-service";

export const dynamic = 'force-dynamic';

/**
 * GET /api/resume/profile
 * Get stored resume profile(s)
 * 
 * Query params:
 * - id: Get specific profile
 * - list: Get all profiles
 * - (none): Get active/most recent profile
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const list = searchParams.get('list');

  try {
    // Get specific profile by ID
    if (id) {
      const profile = await getResumeAnalysisById(id);
      if (!profile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      return NextResponse.json({ profile });
    }

    // List all profiles
    if (list === 'true') {
      const profiles = await listResumeAnalyses();
      return NextResponse.json({ 
        profiles,
        count: profiles.length,
      });
    }

    // Get active (most recent) profile
    const profile = await getActiveResumeAnalysis();
    if (!profile) {
      return NextResponse.json({ 
        error: "No resume profile found. Upload and parse a resume first.",
        hasProfile: false,
      }, { status: 404 });
    }

    return NextResponse.json({ 
      profile,
      hasProfile: true,
    });

  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/resume/profile
 * Delete a stored resume profile
 * 
 * Query params:
 * - id: Profile ID to delete (required)
 */
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: "Profile ID is required" }, { status: 400 });
  }

  try {
    const success = await deleteResumeAnalysis(id);
    if (!success) {
      return NextResponse.json({ error: "Failed to delete profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error("Error deleting profile:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete profile" },
      { status: 500 }
    );
  }
}
