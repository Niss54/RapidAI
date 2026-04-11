const express = require("express");
const apiKeyService = require("../services/apiKeyService");

const router = express.Router();

function resolveUserId(req) {
  const fromContext = String(req?.user_id || req?.authContext?.user_id || "").trim();
  if (fromContext) {
    return fromContext;
  }

  const headerValue = req?.headers?.["x-user-id"];
  const fromHeader = Array.isArray(headerValue)
    ? String(headerValue[0] || "").trim()
    : String(headerValue || "").trim();

  if (fromHeader) {
    return fromHeader;
  }

  return String(req?.query?.userId || "").trim();
}

function buildMetadataPayload(metadata) {
  return {
    user_id: metadata.user_id,
    plan_type: metadata.plan_type,
    usage_limit: metadata.usage_limit,
    usage_count: Number(metadata.usage_count || 0),
    created_at: metadata.created_at,
    expires_at: metadata.expires_at,
    is_active: metadata.is_active,
  };
}

router.get("/my-key", async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({
        error: "userId is required. Provide x-user-id header or userId query parameter.",
      });
    }

    const result = await apiKeyService.getOrCreateApiKeyForUser(userId);

    return res.status(200).json({
      ...buildMetadataPayload(result.metadata),
      api_key_masked: result.maskedApiKey,
      auto_created: result.autoCreated,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not resolve API key",
    });
  }
});

router.post("/regenerate", async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({
        error: "userId is required. Provide x-user-id header or userId query parameter.",
      });
    }

    const result = await apiKeyService.regenerateApiKeyForUser(userId);

    return res.status(200).json({
      ...buildMetadataPayload(result.metadata),
      api_key_masked: result.maskedApiKey,
      api_key: result.apiKey,
      regenerated: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not regenerate API key",
    });
  }
});

module.exports = router;
