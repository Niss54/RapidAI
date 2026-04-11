const express = require("express");

const router = express.Router();

function readVerifyToken() {
  return String(process.env.VERIFY_TOKEN || "").trim();
}

router.get("/webhook", (req, res) => {
  const mode = String(req?.query?.["hub.mode"] || "").trim();
  const token = String(req?.query?.["hub.verify_token"] || "").trim();
  const challenge = req?.query?.["hub.challenge"];
  const expectedToken = readVerifyToken();

  if (!expectedToken) {
    return res.status(503).json({
      error: "WhatsApp webhook verification is inactive",
    });
  }

  if (mode === "subscribe" && token && token === expectedToken && challenge !== undefined) {
    return res.status(200).type("text/plain").send(String(challenge));
  }

  return res.status(403).json({
    error: "Webhook verification failed",
  });
});

router.post("/webhook", (req, res) => {
  const payload = req.body && typeof req.body === "object" ? req.body : {};

  // TODO: Support patient status query commands from incoming doctor messages.
  // TODO: Support ICU summary query commands from incoming doctor messages.
  // TODO: Support alert acknowledgement commands from incoming doctor messages.
  console.log("[WhatsAppWebhook] Incoming payload:", payload);

  return res.status(200).json({
    status: "received",
  });
});

module.exports = router;
