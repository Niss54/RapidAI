const { AccessToken, RoomServiceClient } = require("livekit-server-sdk");

const DEFAULT_ROOM = "icu-room";
const DEFAULT_IDENTITY = "doctor-console";

function getLiveKitSecret() {
  return process.env.LIVEKIT_SECRET || process.env.LIVEKIT_API_SECRET;
}

function getLiveKitWsUrl() {
  return process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL || "ws://localhost:7880";
}

function getLiveKitHost() {
  const explicitHost = process.env.LIVEKIT_HOST;
  if (explicitHost) {
    return explicitHost;
  }

  const wsUrl = getLiveKitWsUrl();
  if (wsUrl.startsWith("wss://")) {
    return wsUrl.replace("wss://", "https://");
  }
  if (wsUrl.startsWith("ws://")) {
    return wsUrl.replace("ws://", "http://");
  }

  return wsUrl;
}

function hasLiveKitCredentials() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const secret = getLiveKitSecret();

  if (!apiKey || !secret) {
    return false;
  }

  if (apiKey.startsWith("your_") || secret.startsWith("your_")) {
    return false;
  }

  return true;
}

function getRoomServiceClient() {
  const host = getLiveKitHost();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const secret = getLiveKitSecret();

  if (!hasLiveKitCredentials()) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_SECRET are required");
  }

  return new RoomServiceClient(host, apiKey, secret);
}

async function ensureRoomExists(roomService) {
  try {
    await roomService.createRoom({
      name: DEFAULT_ROOM,
      emptyTimeout: 10 * 60,
    });
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (!message.includes("already exists")) {
      throw error;
    }
  }
}

async function createVoiceToken() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const secret = getLiveKitSecret();

  if (!hasLiveKitCredentials()) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_SECRET are required");
  }

  const token = new AccessToken(apiKey, secret, {
    identity: DEFAULT_IDENTITY,
    ttl: "2h",
  });

  token.addGrant({
    roomJoin: true,
    room: DEFAULT_ROOM,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return {
    token: await token.toJwt(),
    roomName: DEFAULT_ROOM,
    identity: DEFAULT_IDENTITY,
    wsUrl: getLiveKitWsUrl(),
  };
}

async function broadcastVoiceMessage({ text, audioBase64, language, eventType }) {
  try {
    const roomService = getRoomServiceClient();
    await ensureRoomExists(roomService);
    const payload = Buffer.from(
      JSON.stringify({
        type: eventType || "voice-message",
        text,
        language,
        audioBase64,
        timestamp: Date.now(),
      })
    );

    if (typeof roomService.sendData === "function") {
      const topic = eventType || "voice-message";
      try {
        await roomService.sendData(DEFAULT_ROOM, payload, 1, [], topic);
      } catch {
        await roomService.sendData(DEFAULT_ROOM, payload);
      }
      return { delivered: true };
    }

    return { delivered: false, reason: "RoomServiceClient.sendData unavailable" };
  } catch (error) {
    return {
      delivered: false,
      reason: error instanceof Error ? error.message : "LiveKit broadcast failed",
    };
  }
}

module.exports = {
  createVoiceToken,
  broadcastVoiceMessage,
};
