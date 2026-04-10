const DEFAULT_PATIENT_IDS = ["201", "202", "203", "204", "205"];
const DEFAULT_INTERVAL_MS = 5000;
const MIN_INTERVAL_MS = 1000;

let simulationTimer = null;
let running = false;
let lastError = null;

function parseIntervalMs() {
  const raw = Number(process.env.SIMULATOR_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw)) {
    return DEFAULT_INTERVAL_MS;
  }

  return Math.max(MIN_INTERVAL_MS, Math.round(raw));
}

function resolveTargetUrl() {
  const explicit = String(process.env.SIMULATOR_TARGET_URL || "").trim();
  if (explicit) {
    return explicit;
  }

  const serverPort = Number(process.env.SERVER_PORT || 4000);
  return `http://127.0.0.1:${serverPort}/telemetry/update`;
}

function pickPatientId() {
  const pool = String(process.env.SIMULATOR_PATIENT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const candidates = pool.length > 0 ? pool : DEFAULT_PATIENT_IDS;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, precision = 1) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(precision));
}

function buildTelemetryPayload() {
  const patientId = pickPatientId();
  return {
    patientId,
    monitorId: `sim-${patientId}`,
    heartRate: randomInt(70, 140),
    spo2: randomInt(82, 99),
    temperature: randomFloat(97.0, 103.0),
    bloodPressure: `${randomInt(90, 160)}/${randomInt(55, 100)}`,
  };
}

async function postTelemetrySample() {
  const response = await fetch(resolveTargetUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildTelemetryPayload()),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Simulator target responded with ${response.status}: ${body}`);
  }
}

async function tick() {
  try {
    await postTelemetrySample();
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Simulator tick failed";
  }
}

function getSimulationStatus() {
  return {
    running,
    status: running ? "Running" : "Stopped",
    intervalMs: parseIntervalMs(),
    targetUrl: resolveTargetUrl(),
    lastError,
  };
}

function startSimulation() {
  if (running && simulationTimer) {
    return getSimulationStatus();
  }

  const intervalMs = parseIntervalMs();
  simulationTimer = setInterval(() => {
    void tick();
  }, intervalMs);

  running = true;
  void tick();
  return getSimulationStatus();
}

function stopSimulation() {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }

  running = false;
  return getSimulationStatus();
}

process.on("exit", () => {
  stopSimulation();
});

module.exports = {
  getSimulationStatus,
  startSimulation,
  stopSimulation,
};
