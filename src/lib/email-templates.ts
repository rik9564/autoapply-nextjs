/**
 * Hardcoded Email Templates
 * Variables: {{company}}, {{position}}, {{your_name}}, {{email}}, {{phone}}, {{experience}}, {{notice_period}}
 */

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

// Default email templates - edit these to customize your outreach
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'qa-automation',
    name: 'QA Automation Engineer',
    subject: 'Application for QA Automation Role | {{experience}} YOE | 30 Days Notice | {{your_name}}',
    body: `Dear Hiring Manager,

I came across the opportunity at {{company}} and wanted to reach out.

I have been working in QA automation for about {{experience}} years, primarily with Selenium, Playwright, and API testing tools. I enjoy building test frameworks and integrating them into CI/CD pipelines.

While my official notice period is 60 days, I have spoken with my manager and HR, and they have kindly agreed to release me within 30 days.

I would love the chance to learn more about your team and contribute where I can. My resume is attached for your reference.

Please feel free to reach me at {{email}} or {{phone}}.

Thank you for your time.

{{your_name}}`
  }
];

/**
 * Get template by ID
 */
export function getTemplate(templateId: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find(t => t.id === templateId);
}

/**
 * Fill template with variables
 */
export function fillTemplate(
  template: EmailTemplate,
  variables: {
    company?: string;
    position?: string;
    your_name?: string;
    email?: string;
    phone?: string;
    experience?: number | string;
    notice_period?: number | string;
  }
): { subject: string; body: string } {
  const { 
    company = 'your company', 
    position = '', 
    your_name = '',
    email = '',
    phone = '',
    experience = '',
    notice_period = ''
  } = variables;
  
  const replaceVars = (text: string): string => {
    return text
      .replace(/\{\{hr_name\}\}/g, 'Hiring Manager')
      .replace(/\{\{company\}\}/g, company)
      .replace(/\{\{position\}\}/g, position)
      .replace(/\{\{your_name\}\}/g, your_name)
      .replace(/\{\{email\}\}/g, email)
      .replace(/\{\{phone\}\}/g, phone)
      .replace(/\{\{experience\}\}/g, String(experience))
      .replace(/\{\{notice_period\}\}/g, String(notice_period));
  };

  return {
    subject: replaceVars(template.subject),
    body: replaceVars(template.body),
  };
}

/**
 * Get default template
 */
export function getDefaultTemplate(): EmailTemplate {
  return EMAIL_TEMPLATES[0]; // qa-automation
}
