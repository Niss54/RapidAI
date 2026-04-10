const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const EventLog = require("../models/EventLog");
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

test("voice logs endpoint forwards patientId filter", async () => {
  const originalListVoiceInteractions = EventLog.listVoiceInteractions;
  const capturedCalls = [];

  EventLog.listVoiceInteractions = async (params) => {
    capturedCalls.push(params);
    return {
      logs: [
        {
          id: "voice-1",
          patient_id: "204",
          query_text: "show patient 204 status",
          detected_intent: "PATIENT_STATUS",
          language: "en",
          response_summary: "Patient 204 is stable",
          timestamp: "2026-04-10T10:00:00.000Z",
        },
      ],
      total: 1,
      page: 2,
      limit: 5,
    };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/icu/voice-logs?patientId=204&language=en&intent=PATIENT_STATUS&page=2&limit=5`
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(Array.isArray(body.logs), true);
      assert.equal(body.logs.length, 1);
      assert.equal(body.logs[0].patient_id, "204");

      assert.equal(capturedCalls.length, 1);
      assert.deepEqual(capturedCalls[0], {
        patientId: "204",
        language: "en",
        intent: "PATIENT_STATUS",
        page: 2,
        limit: 5,
      });
    });
  } finally {
    EventLog.listVoiceInteractions = originalListVoiceInteractions;
  }
});
