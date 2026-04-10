const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const forecastService = require("../services/forecastService");
const Patient = require("../models/Patient");

const originalPredictRisk = forecastService.predictRiskNextFiveMinutes;
forecastService.predictRiskNextFiveMinutes = async () => ({
  predictedRiskLevel: "WARNING",
  source: "heuristic-fallback",
  warning: null,
  forecastedVitals: null,
});

const summaryRouter = require("../routes/summary");

function createServer() {
  const app = express();
  app.use("/icu", summaryRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve(server);
    });
  });
}

async function withServer(run) {
  const server = await createServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("projection endpoint rejects invalid date range", async () => {
  await withServer(async (baseUrl) => {
    const from = "2026-04-10T10:00:00.000Z";
    const to = "2026-04-09T10:00:00.000Z";
    const response = await fetch(
      `${baseUrl}/icu/forecast/projection?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /Invalid date range/i);
  });
});

test("projection export endpoint rejects invalid date range", async () => {
  await withServer(async (baseUrl) => {
    const from = "2026-04-10T10:00:00.000Z";
    const to = "2026-04-09T10:00:00.000Z";
    const response = await fetch(
      `${baseUrl}/icu/forecast/projection/export?format=csv&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /Invalid date range/i);
  });
});

test("projection export CSV includes applied filter metadata", async () => {
  const originalListPatients = Patient.listPatients;

  Patient.listPatients = async () => [
    {
      patientId: "anon_test_01",
      heartRate: 99,
      spo2: 95,
      temperature: 37.5,
      bloodPressure: "122/80",
      riskScore: 44,
      predictedRiskNext5Minutes: "WARNING",
      lastUpdated: "2026-04-10T09:00:00.000Z",
    },
  ];

  try {
    await withServer(async (baseUrl) => {
      const from = "2026-04-10T08:00:00.000Z";
      const to = "2026-04-10T10:30:00.000Z";
      const response = await fetch(
        `${baseUrl}/icu/forecast/projection/export?format=csv&patientIds=anon_test_01&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );

      assert.equal(response.status, 200);
      const csv = await response.text();
      const lines = csv.split(/\r?\n/);

      assert.equal(lines[0], "metaKey,metaValue");
      assert.ok(lines.some((line) => line.startsWith("generatedAt,")));
      assert.ok(lines.includes("filteredTotal,1"));
      assert.ok(lines.includes("filterPatientIds,anon_test_01"));
      assert.ok(lines.includes(`filterFrom,${from}`));
      assert.ok(lines.includes(`filterTo,${to}`));

      const headerIndex = lines.findIndex((line) =>
        line.startsWith("generatedAt,patientId,patientLastUpdated,currentRiskScore")
      );
      assert.notEqual(headerIndex, -1);
      assert.ok(lines.slice(headerIndex + 1).some((line) => line.includes("anon_test_01")));
    });
  } finally {
    Patient.listPatients = originalListPatients;
  }
});

test.after(() => {
  forecastService.predictRiskNextFiveMinutes = originalPredictRisk;
});
