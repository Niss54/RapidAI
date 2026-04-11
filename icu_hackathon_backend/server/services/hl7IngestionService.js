const axios = require("axios");
const hl7 = require("simple-hl7");
const { logIngestionError } = require("./ingestionLogger");

const defaultHl7Adapter = hl7;
const defaultTimerApi = {
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (...args) => clearTimeout(...args),
};

const DEFAULT_HL7_PORT = 7777;
const DEFAULT_FORWARD_URL = (() => {
  const rawPort = String(process.env.SERVER_PORT || process.env.PORT || "4000").trim();
  const numericPort = Number(rawPort);
  const port = Number.isFinite(numericPort) && numericPort > 0 ? Math.round(numericPort) : 4000;
  return `http://localhost:${port}/telemetry/update`;
})();
const DEFAULT_RESTART_DELAY_MS = 3000;

let listenerStarted = false;
let listenerPort = DEFAULT_HL7_PORT;
let listenerForwardUrl = DEFAULT_FORWARD_URL;
let lastMessageReceivedAt = null;
let listenerRestartDelayMs = DEFAULT_RESTART_DELAY_MS;
let hl7TcpApp = null;
let restartTimer = null;
let shuttingDown = false;
let hl7Adapter = defaultHl7Adapter;
let timerApi = { ...defaultTimerApi };

function getHl7IngestionStatus() {
  return {
    running: listenerStarted,
    port: listenerPort,
    forwardUrl: listenerForwardUrl,
    lastMessageReceived: lastMessageReceivedAt,
    restartDelayMs: listenerRestartDelayMs,
    restartScheduled: Boolean(restartTimer),
  };
}

function resolveRestartDelayMs(options = {}) {
  const raw = Number(options.restartDelayMs || process.env.HL7_RESTART_DELAY_MS || DEFAULT_RESTART_DELAY_MS);
  if (!Number.isFinite(raw) || raw < 1000) {
    return DEFAULT_RESTART_DELAY_MS;
  }

  return Math.round(raw);
}

function clearRestartTimer() {
  if (!restartTimer) {
    return;
  }

  timerApi.clearTimeout(restartTimer);
  restartTimer = null;
}

function scheduleRestart(reason) {
  if (shuttingDown || listenerStarted || restartTimer) {
    return;
  }

  console.warn(`[HL7] listener restart scheduled in ${listenerRestartDelayMs} ms (${reason})`);
  restartTimer = timerApi.setTimeout(() => {
    restartTimer = null;

    if (shuttingDown || listenerStarted) {
      return;
    }

    startHl7IngestionService({
      port: listenerPort,
      forwardUrl: listenerForwardUrl,
      restartDelayMs: listenerRestartDelayMs,
    });
  }, listenerRestartDelayMs);
}

function safeStopCurrentListener() {
  if (!hl7TcpApp) {
    return;
  }

  try {
    if (typeof hl7TcpApp.stop === "function" && hl7TcpApp.server) {
      hl7TcpApp.stop();
    }
  } catch (error) {
    logIngestionError("hl7", "listener-stop", error, {
      port: listenerPort,
    });
  } finally {
    hl7TcpApp = null;
    listenerStarted = false;
  }
}

function attachLifecycle(app) {
  const tcpServer = app?.server;
  const netServer = tcpServer?.server;

  if (!netServer || typeof netServer.on !== "function") {
    return;
  }

  netServer.on("listening", () => {
    listenerStarted = true;
  });

  netServer.on("close", () => {
    listenerStarted = false;
    scheduleRestart("listener closed");
  });

  netServer.on("error", (error) => {
    listenerStarted = false;
    logIngestionError("hl7", "listener-runtime", error, {
      port: listenerPort,
    });
    scheduleRestart("listener error");
  });
}

function toUpperToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function toNumber(value) {
  const cleaned = String(value || "").trim().replace(/[^0-9.+-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function parseBloodPressurePair(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (!match) {
    return null;
  }

  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);

  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
    return null;
  }

  return `${Math.round(systolic)}/${Math.round(diastolic)}`;
}

function resolveObservationType(obx) {
  const code = toUpperToken(obx.getComponent(3, 1));
  const label = toUpperToken(obx.getComponent(3, 2));
  const field = toUpperToken(obx.getField(3));
  const keys = [label, code, field].filter(Boolean);

  if (keys.some((key) => key === "HR" || key.includes("HEARTRATE") || key.includes("PULSERATE") || key === "PULSE")) {
    return "heartRate";
  }

  if (keys.some((key) => key === "SPO2" || key.includes("O2SAT") || key.includes("OXYGENSAT"))) {
    return "spo2";
  }

  if (keys.some((key) => key === "TEMP" || key.includes("TEMPERATURE"))) {
    return "temperature";
  }

  if (keys.some((key) => key === "BP" || key.includes("BLOODPRESSURE") || key.includes("NIBP"))) {
    return "bloodPressure";
  }

  return "unknown";
}

function normalizeTelemetryFromHl7Message(message) {
  const pid = message.getSegment("PID");
  const patientId = firstNonEmpty(
    pid ? pid.getComponent(3, 1) : "",
    pid ? pid.getField(3) : "",
    pid ? pid.getField(2) : ""
  );

  const observations = {
    heartRate: null,
    spo2: null,
    temperature: null,
    bloodPressure: "",
  };

  const obxSegments = message.getSegments("OBX") || [];

  for (const obx of obxSegments) {
    const type = resolveObservationType(obx);
    const rawValue = obx.getField(5);

    if (type === "heartRate") {
      const value = toNumber(rawValue);
      if (value !== null) {
        observations.heartRate = value;
      }
      continue;
    }

    if (type === "spo2") {
      const value = toNumber(rawValue);
      if (value !== null) {
        observations.spo2 = value;
      }
      continue;
    }

    if (type === "temperature") {
      const value = toNumber(rawValue);
      if (value !== null) {
        observations.temperature = value;
      }
      continue;
    }

    if (type === "bloodPressure") {
      const pair = parseBloodPressurePair(rawValue);
      if (pair) {
        observations.bloodPressure = pair;
      }
      continue;
    }

    // Ignore unknown OBX segment types safely.
    continue;
  }

  if (!patientId) {
    throw new Error("Missing patient_id in HL7 ORU^R01 message");
  }

  if (
    observations.heartRate === null ||
    observations.spo2 === null ||
    observations.temperature === null ||
    !observations.bloodPressure
  ) {
    throw new Error("Incomplete telemetry fields in HL7 ORU^R01 message");
  }

  return {
    patientId,
    heartRate: Number(observations.heartRate),
    spo2: Number(observations.spo2),
    temperature: Number(observations.temperature),
    bloodPressure: observations.bloodPressure,
  };
}

function startHl7IngestionService(options = {}) {
  if (listenerStarted) {
    return getHl7IngestionStatus();
  }

  const port = Number(options.port || process.env.HL7_TCP_PORT || DEFAULT_HL7_PORT);
  const forwardUrl = String(options.forwardUrl || process.env.HL7_FORWARD_URL || DEFAULT_FORWARD_URL);
  const restartDelayMs = resolveRestartDelayMs(options);
  listenerPort = port;
  listenerForwardUrl = forwardUrl;
  listenerRestartDelayMs = restartDelayMs;

  clearRestartTimer();
  safeStopCurrentListener();

  hl7TcpApp = hl7Adapter.tcp();

  hl7TcpApp.use((req, res, next) => {
    const type = String(req.type || "").toUpperCase();
    const event = String(req.event || "").toUpperCase();

    if (type !== "ORU" || event !== "R01") {
      return res.end();
    }

    lastMessageReceivedAt = new Date().toISOString();
    console.log("HL7 message received");

    let telemetryPayload;
    try {
      telemetryPayload = normalizeTelemetryFromHl7Message(req.msg);
    } catch (error) {
      logIngestionError("hl7", "parse", error, {
        port,
        messageType: type,
        messageEvent: event,
      });

      const message = error instanceof Error ? error.message : String(error || "HL7 parsing failed");

      const msa = res.ack.getSegment("MSA");
      msa.setField(1, "AR");
      res.ack.addSegment("ERR", message);
      return res.end();
    }

    const normalizedPayload = {
      ...telemetryPayload,
      monitorId: telemetryPayload.monitorId || "hl7-tcp",
      source: "hl7",
    };

    axios
      .post(forwardUrl, normalizedPayload, {
        timeout: 8000,
      })
      .then(() => {
        console.log("Decoded telemetry forwarded");
        res.end();
      })
      .catch((error) => {
        logIngestionError("hl7", "forward", error, {
          port,
          forwardUrl,
          patientId: normalizedPayload.patientId,
        });
        next(error);
      });
  });

  hl7TcpApp.use((err, req, res) => {
    logIngestionError("hl7", "middleware", err, {
      port,
      patientId: req?.msg ? firstNonEmpty(req.msg.getSegment("PID")?.getComponent(3, 1)) : "",
    });

    if (!res || !res.ack || typeof res.end !== "function") {
      return;
    }

    const message = err instanceof Error ? err.message : String(err || "HL7 ingestion failed");

    const msa = res.ack.getSegment("MSA");
    msa.setField(1, "AR");
    res.ack.addSegment("ERR", message);
    res.end();
  });

  try {
    hl7TcpApp.start(port);
    attachLifecycle(hl7TcpApp);
    listenerStarted = true;
    clearRestartTimer();
    console.log(`[HL7] TCP listener started on port ${port}`);
  } catch (error) {
    listenerStarted = false;
    logIngestionError("hl7", "listener-start", error, {
      port,
      forwardUrl,
    });
    scheduleRestart("start failure");
  }

  return getHl7IngestionStatus();
}

process.on("exit", () => {
  shuttingDown = true;
  clearRestartTimer();
  safeStopCurrentListener();
});

function setHl7IngestionTestDependencies(dependencies = {}) {
  if (dependencies.hl7Adapter && typeof dependencies.hl7Adapter.tcp === "function") {
    hl7Adapter = dependencies.hl7Adapter;
  }

  if (dependencies.timerApi) {
    const nextTimerApi = { ...timerApi };

    if (typeof dependencies.timerApi.setTimeout === "function") {
      nextTimerApi.setTimeout = dependencies.timerApi.setTimeout;
    }

    if (typeof dependencies.timerApi.clearTimeout === "function") {
      nextTimerApi.clearTimeout = dependencies.timerApi.clearTimeout;
    }

    timerApi = nextTimerApi;
  }
}

function resetHl7IngestionServiceForTests() {
  clearRestartTimer();
  safeStopCurrentListener();
  listenerStarted = false;
  listenerPort = DEFAULT_HL7_PORT;
  listenerForwardUrl = DEFAULT_FORWARD_URL;
  lastMessageReceivedAt = null;
  listenerRestartDelayMs = DEFAULT_RESTART_DELAY_MS;
  hl7TcpApp = null;
  restartTimer = null;
  shuttingDown = false;
  hl7Adapter = defaultHl7Adapter;
  timerApi = { ...defaultTimerApi };
}

module.exports = {
  startHl7IngestionService,
  normalizeTelemetryFromHl7Message,
  getHl7IngestionStatus,
  resolveRestartDelayMs,
  __setHl7IngestionTestDependencies: setHl7IngestionTestDependencies,
  __resetHl7IngestionServiceForTests: resetHl7IngestionServiceForTests,
};