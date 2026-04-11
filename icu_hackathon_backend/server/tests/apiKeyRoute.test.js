const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const apiKeyService = require("../services/apiKeyService");
const apiKeyRouter = require("../routes/apiKey");

function createServer() {
  const app = express();
  app.use("/api-key", apiKeyRouter);
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

test("GET /api-key/my-key auto-creates first key and returns masked value", async () => {
  const original = apiKeyService.getOrCreateApiKeyForUser;
  let capturedUserId = null;

  apiKeyService.getOrCreateApiKeyForUser = async (userId) => {
    capturedUserId = userId;
    return {
      metadata: {
        user_id: userId,
        plan_type: "free",
        usage_limit: 1000,
        usage_count: 0,
        created_at: "2026-04-11T10:00:00.000Z",
        expires_at: "2026-05-11T10:00:00.000Z",
        is_active: true,
      },
      maskedApiKey: "rapid_live_xxxxxxxxabcd",
      autoCreated: true,
    };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api-key/my-key`, {
        headers: {
          "x-user-id": "doctor-101",
        },
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(capturedUserId, "doctor-101");
      assert.equal(body.user_id, "doctor-101");
      assert.equal(body.plan_type, "free");
      assert.equal(body.usage_limit, 1000);
      assert.equal(body.usage_count, 0);
      assert.equal(body.auto_created, true);
      assert.equal(body.api_key_masked, "rapid_live_xxxxxxxxabcd");
    });
  } finally {
    apiKeyService.getOrCreateApiKeyForUser = original;
  }
});

test("GET /api-key/my-key returns 400 when user id is missing", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api-key/my-key`);

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /userId is required/i);
  });
});

test("POST /api-key/regenerate returns new key metadata and raw key", async () => {
  const original = apiKeyService.regenerateApiKeyForUser;
  let capturedUserId = null;

  apiKeyService.regenerateApiKeyForUser = async (userId) => {
    capturedUserId = userId;
    return {
      apiKey: "rapid_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      metadata: {
        user_id: userId,
        plan_type: "free",
        usage_limit: 1000,
        usage_count: 0,
        created_at: "2026-04-11T12:00:00.000Z",
        expires_at: "2026-05-11T12:00:00.000Z",
        is_active: true,
      },
      maskedApiKey: "rapid_live_xxxxxxxxaaaa",
      regenerated: true,
    };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api-key/regenerate`, {
        method: "POST",
        headers: {
          "x-user-id": "doctor-101",
        },
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(capturedUserId, "doctor-101");
      assert.equal(body.user_id, "doctor-101");
      assert.equal(body.plan_type, "free");
      assert.equal(body.usage_limit, 1000);
      assert.equal(body.usage_count, 0);
      assert.equal(body.api_key_masked, "rapid_live_xxxxxxxxaaaa");
      assert.equal(body.api_key, "rapid_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      assert.equal(body.regenerated, true);
    });
  } finally {
    apiKeyService.regenerateApiKeyForUser = original;
  }
});

test("POST /api-key/regenerate returns 400 when user id is missing", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api-key/regenerate`, {
      method: "POST",
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /userId is required/i);
  });
});
