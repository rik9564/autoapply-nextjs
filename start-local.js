const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGroqKey() {
  // Check process.env first (CI / shell exports)
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
    return process.env.GROQ_API_KEY;
  }
  // Parse .env.local
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^GROQ_API_KEY\s*=\s*(.+)$/);
      if (m) {
        const val = m[1].trim().replace(/^['"]|['"]$/g, '');
        if (val && val !== 'your_groq_api_key_here') return val;
      }
    }
  }
  return null;
}

async function main() {
  console.log("==============================================");
  console.log("  AutoApply — powered by Groq");
  console.log("==============================================\n");

  const groqKey = getGroqKey();

  if (!groqKey) {
    console.log("⚠️  GROQ_API_KEY is not set.");
    console.log("\nAdd your key to .env.local:");
    console.log("  GROQ_API_KEY=gsk_...\n");
    console.log("Get a free key at: https://console.groq.com/keys\n");
    console.log("Continuing anyway — AI features will fail until the key is set.\n");
  } else {
    console.log("✅ GROQ_API_KEY found.\n");
  }

  console.log("[1/2] Checking npm dependencies...");
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log("✅ Dependencies ready.\n");
  } catch {
    console.error("❌ npm install failed.");
    process.exit(1);
  }

  console.log("[2/2] Starting Next.js on http://localhost:4000 ...\n");
  try {
    execSync('npm run next:dev', { stdio: 'inherit', shell: true });
  } catch {
    process.exit(0);
  }
}

main().catch(console.error);
