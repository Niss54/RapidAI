const axios = require("axios");

let inactiveLogged = false;
const DEFAULT_WHATSAPP_TIMEOUT_MS = 10000;

function hasPlaceholderValue(value) {
  return /^your[_-]/i.test(String(value || "").trim());
}

function toSafeTimeoutMs(value, fallback = DEFAULT_WHATSAPP_TIMEOUT_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.round(parsed);
}

function resolveStatus() {
  const token = String(process.env.WHATSAPP_TOKEN || "").trim();
  const phoneNumberId = String(process.env.PHONE_NUMBER_ID || "").trim();

  const tokenConfigured = Boolean(token) && !hasPlaceholderValue(token);
  const phoneNumberConfigured = Boolean(phoneNumberId) && !hasPlaceholderValue(phoneNumberId);
  const configured = tokenConfigured && phoneNumberConfigured;

  return {
    token,
    phoneNumberId,
    tokenConfigured,
    phoneNumberConfigured,
    configured,
    reason: configured ? null : "credentials-missing",
  };
}

function logInactiveStatusOnce(status) {
  if (status.configured || inactiveLogged) {
    return;
  }

  console.warn(
    `[WhatsApp] integration inactive (${status.reason}); tokenConfigured=${status.tokenConfigured}, phoneNumberConfigured=${status.phoneNumberConfigured}`
  );
  inactiveLogged = true;
}

function readConfig() {
  const status = resolveStatus();
  logInactiveStatusOnce(status);

  return status;
}

function getWhatsAppIntegrationStatus() {
  const status = resolveStatus();
  logInactiveStatusOnce(status);

  return {
    status: status.configured ? "active" : "inactive",
    tokenConfigured: status.tokenConfigured,
    phoneNumberConfigured: status.phoneNumberConfigured,
    reason: status.reason,
  };
}

function normalizeRecipientNumber(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function buildWhatsAppPayload(message, recipientNumber) {
  const body = String(message || "").trim();
  const to = normalizeRecipientNumber(recipientNumber);

  if (!body || !to) {
    return null;
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      preview_url: false,
      body,
    },
  };
}

async function sendWhatsAppAlert(message, recipientNumber) {
  const payload = buildWhatsAppPayload(message, recipientNumber);
  if (!payload) {
    return {
      sent: false,
      reason: "invalid-input",
    };
  }

  const { token, phoneNumberId, configured } = readConfig();
  if (!configured) {
    return {
      sent: false,
      reason: "inactive",
      payload,
    };
  }

  const graphVersion = String(process.env.WHATSAPP_GRAPH_VERSION || "v21.0").trim();
  const endpoint = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  try {
    const { data } = await axios.post(endpoint, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: toSafeTimeoutMs(process.env.WHATSAPP_TIMEOUT_MS),
    });

    return {
      sent: true,
      messageId: data?.messages?.[0]?.id || null,
      response: data,
      payload,
    };
  } catch (error) {
    return {
      sent: false,
      reason: "request-failed",
      status: error?.response?.status || null,
      error: error?.response?.data || (error instanceof Error ? error.message : "Unknown WhatsApp API error"),
      payload,
    };
  }
}

module.exports = {
  buildWhatsAppPayload,
  sendWhatsAppAlert,
  getWhatsAppIntegrationStatus,
};