const express = require("express");
const Patient = require("../models/Patient");
const EventLog = require("../models/EventLog");
const { analyzeRisk } = require("../services/riskAnalyzer");
const { predictRiskNextFiveMinutes } = require("../services/forecastService");

const router = express.Router();
const PROJECTION_FORECAST_CONCURRENCY = (() => {
  const parsed = Number(process.env.PROJECTION_FORECAST_CONCURRENCY || 6);
  if (!Number.isFinite(parsed)) {
    return 6;
  }

  const normalized = Math.round(parsed);
  if (normalized < 1) {
    return 1;
  }

  return Math.min(normalized, 24);
})();
const ABORT_WARNING_PATTERN = /\babort(ed|ing)?\b|operation was aborted/i;
const PROJECTION_RETRY_BACKOFF_MS = (() => {
  const parsed = Number(process.env.PROJECTION_RETRY_BACKOFF_MS || 140);
  if (!Number.isFinite(parsed)) {
    return 140;
  }

  const normalized = Math.round(parsed);
  return Math.max(0, Math.min(normalized, 2000));
})();

function resolveRequestApiKey(req) {
  const header = req?.headers?.["x-api-key"];
  return Array.isArray(header)
    ? String(header[0] || "").trim()
    : String(header || "").trim();
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampRiskScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizePredictedState(value) {
  const normalized = String(value || "WARNING").trim().toUpperCase();
  if (["CRITICAL", "MODERATE", "WARNING", "STABLE"].includes(normalized)) {
    return normalized;
  }

  return "WARNING";
}

function fallbackScoreFromState(state, currentRiskScore) {
  const normalized = normalizePredictedState(state);
  const anchors = {
    STABLE: 20,
    WARNING: 45,
    MODERATE: 62,
    CRITICAL: 85,
  };

  const anchor = anchors[normalized] ?? 45;
  return clampRiskScore(Math.round(currentRiskScore * 0.35 + anchor * 0.65));
}

function projectedVitalsFromForecast(forecastedVitals, patient) {
  if (!Array.isArray(forecastedVitals) || forecastedVitals.length < 6) {
    return null;
  }

  const hr = toFiniteNumber(forecastedVitals[0]);
  const spo2 = toFiniteNumber(forecastedVitals[1]);
  const sbp = toFiniteNumber(forecastedVitals[2]);
  const dbp = toFiniteNumber(forecastedVitals[3]);
  const temp = toFiniteNumber(forecastedVitals[5]);

  if (hr === null || spo2 === null || sbp === null || dbp === null || temp === null) {
    return null;
  }

  return {
    heartRate: Math.round(hr),
    spo2: Math.round(spo2),
    temperature: Number(temp.toFixed(1)),
    bloodPressure: `${Math.round(sbp)}/${Math.round(dbp)}`,
    fallbackPatientId: patient.patientId,
  };
}

function buildTimelineProjection(currentRiskScore, futureRiskScore) {
  const current = clampRiskScore(currentRiskScore);
  const future = clampRiskScore(futureRiskScore);
  const future10 = clampRiskScore(Math.round(future + (future - current) * 0.6));

  return [
    { minute: 0, riskScore: current },
    { minute: 5, riskScore: future },
    { minute: 10, riskScore: future10 },
  ];
}

function buildSourceSummary(projections) {
  const summary = {
    legacyMl: 0,
    heuristicFallback: 0,
    disabled: 0,
  };

  for (const projection of projections) {
    const source = String(projection?.source || "").toLowerCase();
    if (source === "legacy-ml") {
      summary.legacyMl += 1;
    } else if (source === "disabled") {
      summary.disabled += 1;
    } else {
      summary.heuristicFallback += 1;
    }
  }

  return summary;
}

function parseDateFilter(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Invalid ${label} filter. Use an ISO timestamp or date string.`);
  }

  return parsed;
}

function sanitizePatientIds(values) {
  const unique = new Set();
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

function parseProjectionFilters(query = {}) {
  const singlePatient = query?.patientId ? [query.patientId] : [];
  const multiplePatients = query?.patientIds ? String(query.patientIds).split(",") : [];
  const patientIds = sanitizePatientIds([...singlePatient, ...multiplePatients]);

  const from = parseDateFilter(query?.from ?? query?.startDate, "from");
  const to = parseDateFilter(query?.to ?? query?.endDate, "to");

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error("Invalid date range. from must be earlier than or equal to to.");
  }

  return {
    patientIds,
    patientIdSet: new Set(patientIds),
    from,
    to,
  };
}

function serializeProjectionFilters(filters) {
  return {
    patientIds: filters.patientIds,
    from: filters.from ? filters.from.toISOString() : null,
    to: filters.to ? filters.to.toISOString() : null,
  };
}

function patientMatchesProjectionFilters(patient, filters) {
  const patientId = String(patient?.patientId || "").trim();

  if (filters.patientIdSet.size > 0 && !filters.patientIdSet.has(patientId)) {
    return false;
  }

  const hasDateFilter = Boolean(filters.from || filters.to);
  if (!hasDateFilter) {
    return true;
  }

  const updatedAt = String(patient?.lastUpdated || "").trim();
  const updatedTs = new Date(updatedAt).getTime();

  if (!Number.isFinite(updatedTs)) {
    return false;
  }

  if (filters.from && updatedTs < filters.from.getTime()) {
    return false;
  }

  if (filters.to && updatedTs > filters.to.getTime()) {
    return false;
  }

  return true;
}

function toCsvField(value) {
  const text = value === undefined || value === null ? "" : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function projectionsToCsv(payload) {
  const generatedAt = payload.generatedAt;
  const projections = Array.isArray(payload.projections) ? payload.projections : [];
  const total = Number.isFinite(payload.total) ? payload.total : projections.length;
  const appliedFilters = payload.appliedFilters || { patientIds: [], from: null, to: null };
  const patientIds = Array.isArray(appliedFilters.patientIds) ? appliedFilters.patientIds : [];

  const headers = [
    "generatedAt",
    "patientId",
    "patientLastUpdated",
    "currentRiskScore",
    "futureRiskScore",
    "predictedDeteriorationState",
    "source",
    "warning",
    "forecastedVitals",
    "timeline0m",
    "timeline5m",
    "timeline10m",
  ];

  const rows = projections.map((projection) => {
    const timelineByMinute = new Map(
      Array.isArray(projection.timelineProjection)
        ? projection.timelineProjection.map((point) => [Number(point.minute), clampRiskScore(point.riskScore)])
        : []
    );

    const forecastedVitals = Array.isArray(projection.forecastedVitals)
      ? projection.forecastedVitals.join("|")
      : "";

    return [
      generatedAt,
      projection.patientId,
      projection.patientLastUpdated || "",
      projection.currentRiskScore,
      projection.futureRiskScore,
      projection.predictedDeteriorationState,
      projection.source,
      projection.warning || "",
      forecastedVitals,
      timelineByMinute.get(0) ?? "",
      timelineByMinute.get(5) ?? "",
      timelineByMinute.get(10) ?? "",
    ];
  });

  const metadataRows = [
    ["metaKey", "metaValue"],
    ["generatedAt", generatedAt],
    ["filteredTotal", total],
    ["filterPatientIds", patientIds.length > 0 ? patientIds.join("|") : "all"],
    ["filterFrom", appliedFilters.from || ""],
    ["filterTo", appliedFilters.to || ""],
    [],
  ];

  return [...metadataRows, headers, ...rows].map((row) => row.map(toCsvField).join(",")).join("\n");
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) {
    return [];
  }

  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, source.length));
  const results = new Array(source.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < source.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(source[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function shouldRetryForecast(forecast) {
  if (String(forecast?.source || "").trim().toLowerCase() === "legacy-ml") {
    return false;
  }

  const warning = String(forecast?.warning || "").trim();
  if (!warning) {
    return false;
  }

  return ABORT_WARNING_PATTERN.test(warning);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function resolveProjectionForecast(vitals, options = {}, index = 0) {
  const firstAttempt = await predictRiskNextFiveMinutes(vitals, options);
  if (!shouldRetryForecast(firstAttempt)) {
    return firstAttempt;
  }

  const retryDelayMs = PROJECTION_RETRY_BACKOFF_MS + (Number(index) % 4) * 35;
  if (retryDelayMs > 0) {
    await sleep(retryDelayMs);
  }

  return predictRiskNextFiveMinutes(vitals, options);
}

async function buildForecastProjectionPayload(filters, options = {}) {
  const forwardedApiKey = String(options?.apiKey || "").trim();
  const patients = await Patient.listPatients();
  const filteredPatients = patients.filter((patient) => patientMatchesProjectionFilters(patient, filters));

  const projections = await mapWithConcurrency(
    filteredPatients,
    PROJECTION_FORECAST_CONCURRENCY,
    async (patient, index) => {
      const vitals = {
        heartRate: patient.heartRate,
        spo2: patient.spo2,
        temperature: patient.temperature,
        bloodPressure: patient.bloodPressure,
      };

      const forecast = await resolveProjectionForecast(vitals, {
        apiKey: forwardedApiKey,
      }, index);

      const currentRiskScore = clampRiskScore(patient.riskScore);
      const projectedVitals = projectedVitalsFromForecast(forecast.forecastedVitals, patient);

      let futureRiskScore = fallbackScoreFromState(forecast.predictedRiskLevel, currentRiskScore);
      let predictedDeteriorationState = normalizePredictedState(
        forecast.predictedRiskLevel || patient.predictedRiskNext5Minutes
      );

      if (projectedVitals) {
        const reassessment = analyzeRisk({
          patientId: patient.patientId,
          heartRate: projectedVitals.heartRate,
          spo2: projectedVitals.spo2,
          temperature: projectedVitals.temperature,
          bloodPressure: projectedVitals.bloodPressure,
        });

        futureRiskScore = clampRiskScore(reassessment.riskScore);
        predictedDeteriorationState = normalizePredictedState(reassessment.riskLevel);
      }

      return {
        patientId: patient.patientId,
        patientLastUpdated: patient.lastUpdated || null,
        currentRiskScore,
        futureRiskScore,
        predictedDeteriorationState,
        source: forecast.source,
        warning: forecast.warning,
        forecastedVitals: forecast.forecastedVitals,
        timelineProjection: buildTimelineProjection(currentRiskScore, futureRiskScore),
      };
    }
  );

  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    total: projections.length,
    appliedFilters: serializeProjectionFilters(filters),
    sourceSummary: buildSourceSummary(projections),
    projections,
  };
}

router.get("/summary", async (_req, res) => {
  try {
    const { summary, patients } = await Patient.summarizePatients();
    return res.status(200).json({ summary, patients });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not fetch ICU summary",
    });
  }
});

router.get("/timeline", async (req, res) => {
  try {
    const patientId = req.query?.patientId ? String(req.query.patientId) : null;
    const limit = req.query?.limit ? Number(req.query.limit) : undefined;
    const events = await EventLog.listTimeline({ patientId, limit });

    return res.status(200).json({
      events,
      total: events.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not fetch ICU timeline",
    });
  }
});

router.get("/voice-logs", async (req, res) => {
  try {
    const language = req.query?.language ? String(req.query.language) : "";
    const intent = req.query?.intent ? String(req.query.intent) : "";
    const patientId = req.query?.patientId ? String(req.query.patientId) : "";
    const page = req.query?.page ? Number(req.query.page) : 1;
    const limit = req.query?.limit ? Number(req.query.limit) : 10;

    const payload = await EventLog.listVoiceInteractions({
      language,
      intent,
      patientId,
      page,
      limit,
    });

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not fetch voice logs",
    });
  }
});

router.get("/forecast/projection", async (req, res) => {
  let filters;
  try {
    filters = parseProjectionFilters(req.query || {});
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid projection filters",
    });
  }

  try {
    const payload = await buildForecastProjectionPayload(filters, {
      apiKey: resolveRequestApiKey(req),
    });
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not fetch forecast projections",
    });
  }
});

router.get("/forecast/projection/export", async (req, res) => {
  const format = String(req.query?.format || "csv").trim().toLowerCase();
  if (format !== "csv" && format !== "json") {
    return res.status(400).json({
      error: "Invalid format. Use format=csv or format=json",
    });
  }

  let filters;
  try {
    filters = parseProjectionFilters(req.query || {});
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid projection filters",
    });
  }

  try {
    const payload = await buildForecastProjectionPayload(filters, {
      apiKey: resolveRequestApiKey(req),
    });
    const timestamp = payload.generatedAt.replace(/[.:]/g, "-");

    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="forecast-projections-${timestamp}.json"`
      );
      return res.status(200).send(JSON.stringify(payload, null, 2));
    }

    const csv = projectionsToCsv(payload);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="forecast-projections-${timestamp}.csv"`
    );
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not export forecast projections",
    });
  }
});

module.exports = router;
