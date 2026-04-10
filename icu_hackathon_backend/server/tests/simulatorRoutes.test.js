const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const simulatorRoutes = require("../routes/simulator");
const { stopSimulation } = require("../services/simulatorService");

function createServer() {
  const app = express();
  app.use("/simulator", simulatorRoutes);
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
    stopSimulation();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("simulator endpoints toggle running state", async () => {
  await withServer(async (baseUrl) => {
    const startResponse = await fetch(`${baseUrl}/simulator/start`, {
      method: "POST",
    });
    assert.equal(startResponse.status, 200);
    const startBody = await startResponse.json();
    assert.equal(Boolean(startBody.running), true);
    assert.equal(startBody.status, "Running");

    const stopResponse = await fetch(`${baseUrl}/simulator/stop`, {
      method: "POST",
    });
    assert.equal(stopResponse.status, 200);
    const stopBody = await stopResponse.json();
    assert.equal(Boolean(stopBody.running), false);
    assert.equal(stopBody.status, "Stopped");
  });
});

test.after(() => {
  stopSimulation();
});
