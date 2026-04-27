# AutoApply - AI-Powered Job Application Automation

An intelligent job application system with email automation, resume parsing, and AI-powered cover letter generation.

## Features

- 🤖 **Blazing Fast AI via Groq** - Uses Llama 3.3 70B with ultra-fast inference
- 📧 **Email Automation** - Dual Gmail SMTP with 940 auto-send emails/day
- 📄 **Resume Parsing** - AI-powered extraction from PDFs and text
- 💾 **Smart Caching** - L1 memory + L2 Supabase database caching
- ✉️ **Preview & Edit** - Edit emails before sending with live preview
- 🔄 **Duplicate Detection** - Prevents re-applying to same company

## Setup

### 1. Get Groq API Key

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up and create an API key
3. Add to `.env.local`:

```env
GROQ_API_KEY=your_api_key_here
```

### 2. Configure Gmail SMTP

Enable 2-Step Verification on your Gmail accounts, then:

1. Go to Google Account → Security → 2-Step Verification → App passwords
2. Generate app password for "Mail"
3. Add to `.env.local`:

```env
SMTP_USER_1=your_email@gmail.com
SMTP_PASS_1=your_app_password

SMTP_USER_2=your_second_email@gmail.com
SMTP_PASS_2=your_app_password
```

### 3. Setup Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run the SQL migrations in the project
3. Add to `.env.local`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

### 4. Run the App

```bash
npm install
npm run dev
```

Open [http://localhost:4000](http://localhost:4000) in your browser.

## Environment Variables

See `.env.example` for all required variables.

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Your Groq API key |
| `SMTP_USER_1` | Primary Gmail address |
| `SMTP_PASS_1` | Primary Gmail app password |
| `SMTP_USER_2` | Secondary Gmail address |
| `SMTP_PASS_2` | Secondary Gmail app password |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |

## Tech Stack

- **Next.js 16** with React 19
- **Groq** for AI (Llama 3.3 70B - ultra fast!)
- **Supabase** for database and caching
- **Nodemailer** for SMTP email
- **TailwindCSS** for styling
