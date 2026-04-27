const { execSync, spawn } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const models = ['gemma:4b', 'gemma', 'gemma:7b', 'gemma2'];

console.log("==============================================");
console.log("Welcome to AutoApply NextJS + Ollama Setup");
console.log("==============================================\n");

console.log("Checking if Ollama is running...");
try {
  execSync('curl -s http://localhost:11434/api/version', { stdio: 'ignore' });
  console.log("✅ Ollama is running.\n");
} catch (e) {
  console.log("❌ Ollama does not seem to be running on http://localhost:11434");
  console.log("Please start Ollama (e.g. run 'ollama serve' in another terminal) and try again.");
  process.exit(1);
}

console.log("Available Local Models:");
models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));

rl.question('\nSelect a model by number (default 1): ', (answer) => {
  const index = parseInt(answer) - 1;
  const selectedModel = models[index] || models[0];
  console.log(`\n=> Selected model: ${selectedModel}\n`);
  
  console.log(`[1/3] Pulling ${selectedModel} via Ollama... (This might take a while if not downloaded)`);
  try {
    execSync(`ollama pull ${selectedModel}`, { stdio: 'inherit' });
    console.log("✅ Model pulled successfully.\n");
  } catch (err) {
    console.error("❌ Failed to pull the model.");
    process.exit(1);
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
  
  // Set the default model so the app knows which one to use if we wanted to pass it via env
  // (We'll just rely on the fallback or user settings, but it's good to pull it)
  const devProcess = spawn(npmCmd, ['run', 'next:dev'], { 
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_DEFAULT_MODEL: selectedModel } 
  });

  devProcess.on('close', (code) => {
    process.exit(code);
  });

  rl.close();
});