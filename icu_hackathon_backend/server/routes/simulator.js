const express = require("express");
const {
  startSimulation,
  stopSimulation,
  getSimulationStatus,
} = require("../services/simulatorService");

const router = express.Router();

router.post("/start", (_req, res) => {
  const status = startSimulation();
  return res.status(200).json(status);
});

router.post("/stop", (_req, res) => {
  const status = stopSimulation();
  return res.status(200).json(status);
});

router.get("/status", (_req, res) => {
  return res.status(200).json(getSimulationStatus());
});

module.exports = router;
