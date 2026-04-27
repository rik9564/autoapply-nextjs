const { execSync, spawn } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const models = [
  { tag: 'gemma4:31b',    label: 'Gemma 4 31B   — 20GB  | 256K context | Text + Image  (Best quality)' },
  { tag: 'gemma4:26b',    label: 'Gemma 4 26B   — 18GB  | 256K context | Text + Image' },
  { tag: 'gemma4:latest', label: 'Gemma 4 Latest — 9.6GB | 128K context | Text + Image' },
  { tag: 'gemma4:e4b',    label: 'Gemma 4 E4B   —  9.6GB | 128K context | Text + Image' },
  { tag: 'gemma4:e2b',    label: 'Gemma 4 E2B   —  7.2GB | 128K context | Lightest' },
];

// Default to 127.0.0.1 instead of localhost to avoid IPv6 resolution issues on some machines
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/version`);
    if (res.ok) {
      return true;
    }
  } catch (e) {
    // Also try localhost if 127.0.0.1 fails, just in case
    if (OLLAMA_URL.includes('127.0.0.1')) {
      try {
        const res2 = await fetch(OLLAMA_URL.replace('127.0.0.1', 'localhost') + '/api/version');
        if (res2.ok) return true;
      } catch (e2) {
        return false;
      }
    }
    return false;
  }
  return false;
}

async function main() {
  console.log("==============================================");
  console.log("Welcome to AutoApply NextJS + Ollama Setup");
  console.log("==============================================\n");

  console.log(`Checking if Ollama is running at ${OLLAMA_URL}...`);
  
  const isRunning = await checkOllama();
  
  if (isRunning) {
    console.log("✅ Ollama is running.\n");
  } else {
    console.log(`❌ Ollama does not seem to be reachable at ${OLLAMA_URL}`);
    console.log("\nIf Ollama is running on a VM or Docker, make sure you start it with:");
    console.log("  OLLAMA_HOST=0.0.0.0 ollama serve");
    console.log("\nYou can also set a custom URL by running:");
    console.log("  set OLLAMA_URL=http://<YOUR_VM_IP>:11434 && npm run dev  (Windows)");
    console.log("  OLLAMA_URL=http://<YOUR_VM_IP>:11434 npm run dev      (Mac/Linux)\n");
    process.exit(1);
  }

  console.log("Available Gemma 4 Models:");
  models.forEach((m, i) => console.log(`  ${i + 1}. ${m.label}`));

  rl.question('\nSelect a model by number (default 3 — gemma4:latest, recommended for most VMs): ', (answer) => {
    const DEFAULT_INDEX = 2; // gemma4:latest (0-indexed)
    const parsed = parseInt(answer) - 1;
    const index = isNaN(parsed) ? DEFAULT_INDEX : Math.max(0, Math.min(parsed, models.length - 1));
    const selected = models[index];
    const selectedModel = selected.tag;
    console.log(`\n=> Selected model: ${selectedModel}\n`);
    
    console.log(`[1/3] Pulling ${selectedModel} via Ollama... (This might take a while if not downloaded)`);
    try {
      // Allow overriding the ollama host for pulling too
      const ollamaHost = OLLAMA_URL.replace('http://', '').replace('https://', '');
      execSync(`ollama pull ${selectedModel}`, { 
        stdio: 'inherit',
        env: { ...process.env, OLLAMA_HOST: ollamaHost }
      });
      console.log("✅ Model ready.\n");
    } catch (err) {
      console.error("⚠️  Could not pull the model using local 'ollama' CLI. If Ollama is remote, make sure the model is pulled there.");
    }

    console.log("[2/3] Checking npm dependencies...");
    try {
      execSync('npm install', { stdio: 'inherit' });
      console.log("✅ Dependencies installed.\n");
    } catch (err) {
      console.error("❌ Failed to install dependencies.");
      process.exit(1);
    }

    console.log(`[3/3] Starting Next.js development server...`);
    const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
    
    const devProcess = spawn(npmCmd, ['run', 'next:dev'], { 
      stdio: 'inherit',
      env: { ...process.env, NEXT_PUBLIC_DEFAULT_MODEL: selectedModel, OLLAMA_URL: OLLAMA_URL } 
    });

    devProcess.on('close', (code) => {
      process.exit(code);
    });

    rl.close();
  });
}

main().catch(console.error);
