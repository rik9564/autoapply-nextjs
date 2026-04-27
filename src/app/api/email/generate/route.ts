import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface GenerateEmailRequest {
  recruiterName: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  candidateName: string;
  resumeText: string;
  skills: string[];
  // Optional pre-written content
  customSubject?: string;
  customBody?: string;
}

// Generate email content using templates (no AI)
export async function POST(request: NextRequest) {
  try {
    const body: GenerateEmailRequest = await request.json();
    const { recruiterName, jobTitle, company, candidateName, skills, customSubject, customBody } = body;

    // If custom content provided, use it directly
    if (customSubject && customBody) {
      return NextResponse.json({
        success: true,
        subject: customSubject,
        body: customBody,
      });
    }

    // Get email template from database
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('name', 'default_application')
      .eq('is_active', true)
      .single();

    // Generate subject from template or default
    const subject = template?.subject_template
      ?.replace('{{job_title}}', jobTitle)
      ?.replace('{{company}}', company)
      ?.replace('{{candidate_name}}', candidateName)
      || `Application for ${jobTitle} position at ${company}`;

    // Generate body from template or use a simple default
    const emailBody = template?.body_template
      ?.replace(/\{\{recruiter_name\}\}/g, recruiterName || 'Hiring Manager')
      ?.replace(/\{\{job_title\}\}/g, jobTitle)
      ?.replace(/\{\{company\}\}/g, company || 'your company')
      ?.replace(/\{\{candidate_name\}\}/g, candidateName)
      ?.replace(/\{\{skills\}\}/g, skills.slice(0, 5).join(', '))
      || generateDefaultEmailBody(recruiterName, jobTitle, company, candidateName, skills);

    return NextResponse.json({
      success: true,
      subject,
      body: emailBody,
    });
  } catch (error) {
    console.error('Generate email error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate email' },
      { status: 500 }
    );
  }
}

function generateDefaultEmailBody(
  recruiterName: string,
  jobTitle: string,
  company: string,
  candidateName: string,
  skills: string[]
): string {
  const greeting = recruiterName ? `Dear ${recruiterName}` : 'Dear Hiring Manager';
  const companyName = company || 'your organization';
  const topSkills = skills.slice(0, 3).join(', ');

  return `${greeting},

I am writing to express my strong interest in the ${jobTitle} position at ${companyName}. With my experience in ${topSkills}, I am confident I would be a valuable addition to your team.

I am particularly drawn to this opportunity because it aligns well with my skills and career goals. I am eager to bring my expertise and contribute to ${companyName}'s continued success.

I would welcome the opportunity to discuss how my background and skills would benefit your team. Thank you for considering my application.

Best regards,
${candidateName}`;
}
