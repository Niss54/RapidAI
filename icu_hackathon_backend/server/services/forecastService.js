const DEFAULT_FORECAST_NEXT_URL = process.env.FORECAST_NEXT_URL || "http://localhost:8080/api/v1/forecast/next";
const DEFAULT_FORECAST_HEALTH_URL = process.env.FORECAST_HEALTH_URL || "http://localhost:8080/health";

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

const FORECAST_ENABLED = parseBoolean(process.env.FORECAST_ENABLED, true);
const REQUEST_TIMEOUT_MS = Number(process.env.FORECAST_REQUEST_TIMEOUT_MS || 3000);

const startupStatus = {
  enabled: FORECAST_ENABLED,
  checkedAt: null,
  ready: false,
  source: "heuristic-fallback",
  message: FORECAST_ENABLED
    ? "Forecast service not checked yet"
    : "Forecast service disabled by FORECAST_ENABLED",
};

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function parseBloodPressure(bloodPressure) {
  const raw = String(bloodPressure || "").trim();
  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return {
      systolic: null,
      diastolic: null,
    };
  }

  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);

  return {
    systolic: Number.isFinite(systolic) ? systolic : null,
    diastolic: Number.isFinite(diastolic) ? diastolic : null,
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePredictedRiskLevel(value) {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "CRITICAL" || normalized === "MODERATE" || normalized === "WARNING" || normalized === "STABLE") {
    return normalized;
  }

  if (normalized === "STATUS_CRITICAL") {
    return "CRITICAL";
  }

  if (normalized === "STATUS_HIGH") {
    return "MODERATE";
  }

  if (normalized === "STATUS_WARNING") {
    return "WARNING";
  }

  if (normalized === "STATUS_NORMAL") {
    return "STABLE";
  }

  return "WARNING";
}

function heuristicForecastLevel({ heartRate, spo2, temperature, bloodPressure }) {
  const hr = toNumber(heartRate);
  const oxygen = toNumber(spo2);
  const temp = toNumber(temperature);
  const { systolic } = parseBloodPressure(bloodPressure);

  if ((oxygen !== null && oxygen < 88) || (hr !== null && (hr < 45 || hr > 130)) || (temp !== null && temp > 39.2)) {
    return "CRITICAL";
  }

  if (
    (oxygen !== null && oxygen < 92) ||
    (hr !== null && (hr < 55 || hr > 115)) ||
    (temp !== null && temp > 38.4) ||
    (systolic !== null && systolic < 95)
  ) {
    return "MODERATE";
  }

  if ((oxygen !== null && oxygen < 95) || (temp !== null && temp > 37.8)) {
    return "WARNING";
  }

  return "STABLE";
}

async function checkLegacyForecastHealth() {
  const timeout = withTimeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(DEFAULT_FORECAST_HEALTH_URL, {
      method: "GET",
      signal: timeout.signal,
    });

    if (!response.ok) {
      return {
        ready: false,
        message: `Health endpoint responded with status ${response.status}`,
      };
    }

    const data = await response.json();
    const forecastEnabled = Boolean(data?.forecast_enabled);
    const forecastReady = Boolean(data?.forecast_ready);
    const initError = String(data?.forecast_init_error || "").trim();

    if (forecastEnabled && forecastReady) {
      return {
        ready: true,
        message: "Legacy ML forecast model is ready",
      };
    }

    return {
      ready: false,
      message: initError || "Legacy forecast service reachable but model is not ready",
    };
  } catch (error) {
    return {
      ready: false,
      message: error instanceof Error ? error.message : "Forecast health check failed",
    };
  } finally {
    timeout.clear();
  }
}

async function initializeForecastService() {
  startupStatus.checkedAt = new Date().toISOString();

  if (!FORECAST_ENABLED) {
    startupStatus.ready = false;
    startupStatus.source = "disabled";
    startupStatus.message = "Forecast service disabled by FORECAST_ENABLED";
    return startupStatus;
  }

  const health = await checkLegacyForecastHealth();

  startupStatus.ready = health.ready;
  startupStatus.source = health.ready ? "legacy-ml" : "heuristic-fallback";
  startupStatus.message = health.message;

  return startupStatus;
}

async function requestLegacyForecast({ heartRate, spo2, temperature, bloodPressure }) {
  const hr = toNumber(heartRate);
  const oxygen = toNumber(spo2);
  const temp = toNumber(temperature);
  const { systolic, diastolic } = parseBloodPressure(bloodPressure);

  const sbp = Number.isFinite(systolic) ? Number(systolic) : Number(hr ?? 0);
  const dbp = Number.isFinite(diastolic)
    ? Number(diastolic)
    : Math.max(40, Math.round((Number.isFinite(sbp) ? sbp : 100) * 0.62));
  const mapPressure = Math.round((sbp + 2 * dbp) / 3);

  const payload = {
    vitals: [[
      Number(hr ?? 0),
      Number(oxygen ?? 0),
      sbp,
      dbp,
      mapPressure,
      Number(temp ?? 0),
    ]],
    feature_names: ["HR", "SPO2", "SBP", "DBP", "MAP", "TEMP"],
  };

  const timeout = withTimeoutSignal(REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(DEFAULT_FORECAST_NEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Forecast endpoint failed with ${response.status}: ${body}`);
    }

    const data = await response.json();

    return {
      predictedRiskLevel: normalizePredictedRiskLevel(data?.status),
      source: "legacy-ml",
      forecastedVitals: Array.isArray(data?.forecasted_vitals) ? data.forecasted_vitals : null,
      warning: null,
    };
  } finally {
    timeout.clear();
  }
}

async function predictRiskNextFiveMinutes(vitals) {
  const heuristic = heuristicForecastLevel(vitals);

  if (!FORECAST_ENABLED) {
    return {
      predictedRiskLevel: heuristic,
      source: "disabled",
      forecastedVitals: null,
      warning: "Forecast disabled; using deterministic fallback forecast",
    };
  }

  try {
    const mlForecast = await requestLegacyForecast(vitals);
    startupStatus.ready = true;
    startupStatus.source = "legacy-ml";
    startupStatus.message = "Legacy ML forecast inference active";
    startupStatus.checkedAt = new Date().toISOString();
    return mlForecast;
  } catch (error) {
    startupStatus.ready = false;
    startupStatus.source = "heuristic-fallback";
    startupStatus.message = error instanceof Error ? error.message : "Forecast inference failed";
    startupStatus.checkedAt = new Date().toISOString();

    return {
      predictedRiskLevel: heuristic,
      source: "heuristic-fallback",
      forecastedVitals: null,
      warning: startupStatus.message,
    };
  }
}

function getForecastServiceStatus() {
  return {
    enabled: startupStatus.enabled,
    checkedAt: startupStatus.checkedAt,
    ready: startupStatus.ready,
    source: startupStatus.source,
    message: startupStatus.message,
    nextUrl: DEFAULT_FORECAST_NEXT_URL,
  };
}

module.exports = {
  initializeForecastService,
  getForecastServiceStatus,
  predictRiskNextFiveMinutes,
  heuristicForecastLevel,
};
