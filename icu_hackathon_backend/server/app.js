require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");

const telemetryRoutes = require("./routes/telemetry");
const voiceRoutes = require("./routes/voice");
const summaryRoutes = require("./routes/summary");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "icu-voice-server" });
});

app.use("/telemetry", telemetryRoutes);
app.use("/voice", voiceRoutes);
app.use("/icu", summaryRoutes);

const port = Number(process.env.SERVER_PORT || 4000);

app.listen(port, () => {
  console.log(`ICU voice server running on http://localhost:${port}`);
});
