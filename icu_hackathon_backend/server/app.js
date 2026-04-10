require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");
const { initializeForecastService, getForecastServiceStatus } = require("./services/forecastService");

const telemetryRoutes = require("./routes/telemetry");
const voiceRoutes = require("./routes/voice");
const summaryRoutes = require("./routes/summary");
const simulatorRoutes = require("./routes/simulator");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "icu-voice-server",
    forecast: getForecastServiceStatus(),
  });
});

app.use("/telemetry", telemetryRoutes);
app.use("/voice", voiceRoutes);
app.use("/icu", summaryRoutes);
app.use("/simulator", simulatorRoutes);

const port = Number(process.env.SERVER_PORT || 4000);

async function start() {
  const forecastStatus = await initializeForecastService();
  console.log(`Forecast mode: ${forecastStatus.source} (${forecastStatus.message})`);

  app.listen(port, () => {
    console.log(`ICU voice server running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Server failed to start", error);
  process.exit(1);
});
