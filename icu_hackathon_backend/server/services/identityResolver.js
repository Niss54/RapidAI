const crypto = require("crypto");

const monitorBindings = new Map();

function normalizeToken(value) {
  return String(value || "").trim();
}

function parseSystolic(bloodPressure) {
  const raw = String(bloodPressure || "").trim();
  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return null;
  }

  const systolic = Number(match[1]);
  return Number.isFinite(systolic) ? systolic : null;
}

function bandHeartRate(heartRate) {
  const value = Number(heartRate);
  if (!Number.isFinite(value)) {
    return "hr-unknown";
  }
  if (value < 50) {
    return "hr-critical";
  }
  if (value < 60) {
    return "hr-low";
  }
  if (value <= 110) {
    return "hr-normal";
  }
  if (value <= 130) {
    return "hr-high";
  }
  return "hr-critical";
}

function bandSpo2(spo2) {
  const value = Number(spo2);
  if (!Number.isFinite(value)) {
    return "spo2-unknown";
  }
  if (value < 85) {
    return "spo2-critical";
  }
  if (value < 90) {
    return "spo2-high-risk";
  }
  if (value < 95) {
    return "spo2-watch";
  }
  return "spo2-normal";
}

function bandTemperature(temperature) {
  const value = Number(temperature);
  if (!Number.isFinite(value)) {
    return "temp-unknown";
  }
  if (value < 35.0) {
    return "temp-critical-low";
  }
  if (value <= 37.5) {
    return "temp-normal";
  }
  if (value <= 38.5) {
    return "temp-watch";
  }
  return "temp-high";
}

function bandSystolic(systolic) {
  if (!Number.isFinite(systolic)) {
    return "bp-unknown";
  }
  if (systolic < 90) {
    return "bp-critical-low";
  }
  if (systolic < 100) {
    return "bp-low";
  }
  if (systolic <= 160) {
    return "bp-normal";
  }
  return "bp-high";
}

function buildVitalsSignature({ heartRate, spo2, temperature, bloodPressure }) {
  const systolic = parseSystolic(bloodPressure);
  return [
    bandHeartRate(heartRate),
    bandSpo2(spo2),
    bandTemperature(temperature),
    bandSystolic(systolic),
  ].join("|");
}

function signatureDistance(a, b) {
  const left = String(a || "").split("|");
  const right = String(b || "").split("|");
  const total = Math.max(left.length, right.length);
  let diff = 0;

  for (let i = 0; i < total; i += 1) {
    if ((left[i] || "") !== (right[i] || "")) {
      diff += 1;
    }
  }

  return diff;
}

function deterministicAnonymousId(seed) {
  const digest = crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 10);
  return `anon_${digest}`;
}

function createBinding(monitorKey, patientId, signature) {
  return {
    monitorKey,
    primaryPatientId: patientId,
    primarySignatures: new Set([signature]),
    collisionBindings: new Map(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getCollisionPatientId(binding, monitorKey, signature) {
  const existing = binding.collisionBindings.get(signature);
  if (existing) {
    return existing;
  }

  const generated = deterministicAnonymousId(`${monitorKey}|collision|${signature}`);
  binding.collisionBindings.set(signature, generated);
  return generated;
}

function resolveIdentity({
  patientId,
  monitorId,
  source,
  bedId,
  heartRate,
  spo2,
  temperature,
  bloodPressure,
}) {
  const monitorKey =
    normalizeToken(monitorId) || normalizeToken(source) || normalizeToken(bedId) || "unknown_monitor";
  const providedPatientId = normalizeToken(patientId);
  const signature = buildVitalsSignature({ heartRate, spo2, temperature, bloodPressure });
  const notes = [];

  let binding = monitorBindings.get(monitorKey);

  if (!binding) {
    const assignedPatientId = providedPatientId || deterministicAnonymousId(`${monitorKey}|primary`);
    binding = createBinding(monitorKey, assignedPatientId, signature);
    monitorBindings.set(monitorKey, binding);

    if (!providedPatientId) {
      notes.push("No patientId provided; assigned deterministic anonymous ID from monitor binding");
    }

    return {
      patientId: assignedPatientId,
      monitorKey,
      providedPatientId: providedPatientId || null,
      resolution: providedPatientId ? "direct-bind" : "anonymous-bind",
      collision: false,
      notes,
    };
  }

  binding.updatedAt = new Date().toISOString();

  if (providedPatientId) {
    if (providedPatientId === binding.primaryPatientId) {
      binding.primarySignatures.add(signature);
      return {
        patientId: binding.primaryPatientId,
        monitorKey,
        providedPatientId,
        resolution: "direct-bind",
        collision: false,
        notes,
      };
    }

    const fallbackPatientId = getCollisionPatientId(binding, monitorKey, signature);
    notes.push(
      `Identity collision detected for ${monitorKey}; preserving primary binding ${binding.primaryPatientId}`
    );

    return {
      patientId: fallbackPatientId,
      monitorKey,
      providedPatientId,
      resolution: "collision-fallback",
      collision: true,
      notes,
    };
  }

  const matchesPrimary = Array.from(binding.primarySignatures).some(
    (knownSignature) => signatureDistance(knownSignature, signature) <= 1
  );

  if (matchesPrimary) {
    binding.primarySignatures.add(signature);
    return {
      patientId: binding.primaryPatientId,
      monitorKey,
      providedPatientId: null,
      resolution: "monitor-binding",
      collision: false,
      notes,
    };
  }

  const fallbackPatientId = getCollisionPatientId(binding, monitorKey, signature);
  notes.push(
    `Vitals pattern collision for ${monitorKey}; generated deterministic fallback patient identity`
  );

  return {
    patientId: fallbackPatientId,
    monitorKey,
    providedPatientId: null,
    resolution: "pattern-fallback",
    collision: true,
    notes,
  };
}

module.exports = {
  resolveIdentity,
};
