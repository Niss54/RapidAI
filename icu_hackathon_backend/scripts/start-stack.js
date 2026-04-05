const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const ROOT = path.resolve(__dirname, "..");
const IS_WINDOWS = process.platform === "win32";

function resolvePythonCommand() {
  const venvRelative = IS_WINDOWS ? path.join("Scripts", "python.exe") : path.join("bin", "python");
  const candidates = [
    process.env.PYTHON_CMD,
    path.join(ROOT, ".venv", venvRelative),
    path.join(ROOT, "..", ".venv", venvRelative),
    IS_WINDOWS ? "python" : "python3",
    "python",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes("/")) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    return candidate;
  }

  return "python";
}

const PYTHON_COMMAND = resolvePythonCommand();

const services = [
  {
    name: "NODE",
    command: IS_WINDOWS ? "npm.cmd" : "npm",
    args: ["--prefix", "server", "start"],
  },
  {
    name: "FLASK",
    command: PYTHON_COMMAND,
    args: ["run.py"],
  },
];

const children = [];
let shuttingDown = false;
let exitCode = 0;

function prefixStream(stream, serviceName, channel) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    const level = channel === "stderr" ? "ERR" : "OUT";
    console.log(`[${serviceName}:${level}] ${line}`);
  });
}

function stopAll(reason) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[STACK] Stopping all services (${reason})...`);

  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill("SIGINT");
      } catch {
        // Ignore kill errors during shutdown.
      }
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        try {
          child.kill("SIGTERM");
        } catch {
          // Ignore kill errors during shutdown.
        }
      }
    }
  }, 1500);

  setTimeout(() => {
    process.exit(exitCode);
  }, 2200);
}

function startService(service) {
  const child = spawn(service.command, service.args, {
    cwd: ROOT,
    env: process.env,
    shell: IS_WINDOWS,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.push(child);

  prefixStream(child.stdout, service.name, "stdout");
  prefixStream(child.stderr, service.name, "stderr");

  child.on("error", (error) => {
    exitCode = 1;
    console.error(`[${service.name}:ERR] Failed to start process: ${error.message}`);
    if (service.name === "FLASK") {
      console.error(
        "[FLASK:ERR] Tip: set PYTHON_CMD (example: PYTHON_CMD=C:/ICU/.venv/Scripts/python.exe) if python is not in PATH."
      );
    }
    stopAll(`${service.name} spawn error`);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const resolvedCode = Number.isInteger(code) ? code : 0;
    exitCode = resolvedCode === 0 ? exitCode : resolvedCode;
    const why = signal ? `signal ${signal}` : `code ${resolvedCode}`;
    console.log(`[${service.name}] exited with ${why}`);
    stopAll(`${service.name} exited`);
  });
}

console.log("[STACK] Starting ICU stack (Node API + Flask forecast service)...");
console.log("[STACK] Press Ctrl+C to stop all services.");
console.log(`[STACK] Python command: ${PYTHON_COMMAND}`);

for (const service of services) {
  startService(service);
}

process.on("SIGINT", () => {
  stopAll("SIGINT");
});

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
});
