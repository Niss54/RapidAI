const axios = require("axios")
const serialport = require("serialport")
const { logIngestionError } = require("./ingestionLogger")

const defaultSerialDependencies = {
  SerialPort: serialport.SerialPort,
  ReadlineParser: serialport.ReadlineParser,
}
const defaultTimerApi = {
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (...args) => clearTimeout(...args),
}

const DEFAULT_BAUD_RATE = 9600
const DEFAULT_FORWARD_URL = (() => {
  const rawPort = String(process.env.SERVER_PORT || process.env.PORT || "4000").trim()
  const numericPort = Number(rawPort)
  const port = Number.isFinite(numericPort) && numericPort > 0 ? Math.round(numericPort) : 4000
  return `http://localhost:${port}/telemetry/update`
})()
const DEFAULT_PATIENT_ID = "serial-monitor"
const DEFAULT_RECONNECT_DELAY_MS = 5000
const MIN_RECONNECT_DELAY_MS = 5000

let bridgeStarted = false
let activePort = null
let reconnectTimer = null
let bridgePortPath = process.platform === "win32" ? "COM3" : "/dev/ttyUSB0"
let bridgeBaudRate = DEFAULT_BAUD_RATE
let bridgeForwardUrl = DEFAULT_FORWARD_URL
let lastMessageReceivedAt = null
let serialDependencies = { ...defaultSerialDependencies }
let timerApi = { ...defaultTimerApi }
let exitHandlerAttached = false

function getSerialBridgeStatus() {
  return {
    running: bridgeStarted,
    port: bridgePortPath,
    baudRate: bridgeBaudRate,
    forwardUrl: bridgeForwardUrl,
    lastMessageReceived: lastMessageReceivedAt,
  }
}

function clearReconnectTimer() {
  if (!reconnectTimer) {
    return
  }

  timerApi.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function closeActivePort() {
  if (!activePort) {
    return
  }

  try {
    if (typeof activePort.close === "function") {
      activePort.close()
    }
  } catch {
    // Ignore close errors during shutdown.
  } finally {
    activePort = null
  }
}

function handleProcessExit() {
  clearReconnectTimer()
  closeActivePort()
}

function registerExitHandler() {
  if (exitHandlerAttached) {
    return
  }

  process.on("exit", handleProcessExit)
  exitHandlerAttached = true
}

function toFiniteNumber(value) {
  const cleaned = String(value || "").trim().replace(/[^0-9.+-]/g, "")
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePortKey(key) {
  return String(key || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

function parseBloodPressure(value) {
  const raw = String(value || "").trim()
  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/)
  if (!match) {
    return ""
  }

  const systolic = Number(match[1])
  const diastolic = Number(match[2])

  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
    return ""
  }

  return `${Math.round(systolic)}/${Math.round(diastolic)}`
}

function resolvePortPath(options = {}) {
  const explicit = String(options.port || process.env.SERIAL_PORT || process.env.SERIAL_DEVICE || "").trim()
  if (explicit) {
    return explicit
  }

  return process.platform === "win32" ? "COM3" : "/dev/ttyUSB0"
}

function resolveReconnectDelayMs(options = {}) {
  const raw = Number(options.reconnectDelayMs || process.env.SERIAL_RECONNECT_DELAY_MS || DEFAULT_RECONNECT_DELAY_MS)
  if (!Number.isFinite(raw)) {
    return DEFAULT_RECONNECT_DELAY_MS
  }

  return Math.max(MIN_RECONNECT_DELAY_MS, Math.round(raw))
}

function parseSerialTelemetryLine(line, patientId = DEFAULT_PATIENT_ID) {
  const source = String(line || "").trim()
  if (!source) {
    return null
  }

  const snapshot = {
    heartRate: null,
    spo2: null,
    temperature: null,
    bloodPressure: "",
  }

  const fields = source.split(",")

  for (const field of fields) {
    const dividerIndex = field.indexOf(":")
    if (dividerIndex < 0) {
      continue
    }

    const key = normalizePortKey(field.slice(0, dividerIndex))
    const value = String(field.slice(dividerIndex + 1) || "").trim()

    if (key === "HR") {
      const parsed = toFiniteNumber(value)
      if (parsed !== null) {
        snapshot.heartRate = parsed
      }
      continue
    }

    if (key === "SPO2") {
      const parsed = toFiniteNumber(value)
      if (parsed !== null) {
        snapshot.spo2 = parsed
      }
      continue
    }

    if (key === "TEMP") {
      const parsed = toFiniteNumber(value)
      if (parsed !== null) {
        snapshot.temperature = parsed
      }
      continue
    }

    if (key === "BP") {
      const parsed = parseBloodPressure(value)
      if (parsed) {
        snapshot.bloodPressure = parsed
      }
      continue
    }

    // Ignore unknown serial fields safely.
    continue
  }

  if (
    snapshot.heartRate === null ||
    snapshot.spo2 === null ||
    snapshot.temperature === null ||
    !snapshot.bloodPressure
  ) {
    throw new Error(`Incomplete serial telemetry line: ${source}`)
  }

  return {
    patientId: String(patientId || DEFAULT_PATIENT_ID),
    heartRate: Number(snapshot.heartRate),
    spo2: Number(snapshot.spo2),
    temperature: Number(snapshot.temperature),
    bloodPressure: snapshot.bloodPressure,
  }
}

function startSerialBridge(options = {}) {
  if (bridgeStarted) {
    return getSerialBridgeStatus()
  }

  const portPath = resolvePortPath(options)
  const baudRate = Number(options.baudRate || process.env.SERIAL_BAUD_RATE || DEFAULT_BAUD_RATE)
  const reconnectDelayMs = resolveReconnectDelayMs(options)
  const forwardUrl = String(options.forwardUrl || process.env.SERIAL_FORWARD_URL || DEFAULT_FORWARD_URL)
  const patientId = String(options.patientId || process.env.SERIAL_PATIENT_ID || DEFAULT_PATIENT_ID)
  bridgePortPath = portPath
  bridgeBaudRate = Number.isFinite(baudRate) ? Math.round(baudRate) : DEFAULT_BAUD_RATE
  bridgeForwardUrl = forwardUrl

  bridgeStarted = true

  const scheduleReconnect = (reason) => {
    if (reconnectTimer) {
      return
    }

    console.warn(`[SerialBridge] reconnect scheduled in ${reconnectDelayMs} ms (${reason})`)
    reconnectTimer = timerApi.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectDelayMs)
  }

  const forwardTelemetry = async (line) => {
    let payload

    try {
      payload = parseSerialTelemetryLine(line, patientId)
      if (!payload) {
        return
      }
    } catch (error) {
      logIngestionError("serial", "parse", error, {
        portPath,
        line: String(line || "").trim(),
      })
      return
    }

    const normalizedPayload = {
      ...payload,
      source: "serial",
      monitorId: `serial-${portPath}`,
    }

    try {
      await axios.post(forwardUrl, normalizedPayload, {
        timeout: 8000,
      })
      console.log("[SerialBridge] telemetry forwarded")
    } catch (error) {
      logIngestionError("serial", "forward", error, {
        portPath,
        forwardUrl,
        patientId: normalizedPayload.patientId,
      })
    }
  }

  const connect = () => {
    clearReconnectTimer()

    const SerialPort = serialDependencies.SerialPort
    const ReadlineParser = serialDependencies.ReadlineParser

    const serialPort = new SerialPort({
      path: portPath,
      baudRate: Number.isFinite(baudRate) ? Math.round(baudRate) : DEFAULT_BAUD_RATE,
      autoOpen: false,
    })

    const parser = serialPort.pipe(new ReadlineParser({ delimiter: "\n" }))

    parser.on("data", (line) => {
      lastMessageReceivedAt = new Date().toISOString()
      void forwardTelemetry(line)
    })

    serialPort.on("open", () => {
      console.log(`[SerialBridge] connected on ${portPath} @ ${baudRate} baud`)
    })

    serialPort.on("close", () => {
      console.warn("[SerialBridge] connection closed")
      logIngestionError("serial", "connection-closed", "Serial connection dropped", {
        portPath,
      })
      scheduleReconnect("close")
    })

    serialPort.on("error", (error) => {
      logIngestionError("serial", "port", error, {
        portPath,
      })
    })

    serialPort.open((error) => {
      if (!error) {
        activePort = serialPort
        return
      }

      const message = error instanceof Error ? error.message : String(error || "open failed")
      console.error("[SerialBridge] open failed:", message)
      logIngestionError("serial", "open", error, {
        portPath,
        baudRate,
      })
      scheduleReconnect("open failed")
    })
  }

  registerExitHandler()

  connect()

  return getSerialBridgeStatus()
}

function setSerialBridgeTestDependencies(dependencies = {}) {
  const nextDependencies = { ...serialDependencies }

  if (dependencies.SerialPort) {
    nextDependencies.SerialPort = dependencies.SerialPort
  }

  if (dependencies.ReadlineParser) {
    nextDependencies.ReadlineParser = dependencies.ReadlineParser
  }

  serialDependencies = nextDependencies

  if (dependencies.timerApi) {
    const nextTimerApi = { ...timerApi }

    if (typeof dependencies.timerApi.setTimeout === "function") {
      nextTimerApi.setTimeout = dependencies.timerApi.setTimeout
    }

    if (typeof dependencies.timerApi.clearTimeout === "function") {
      nextTimerApi.clearTimeout = dependencies.timerApi.clearTimeout
    }

    timerApi = nextTimerApi
  }
}

function resetSerialBridgeForTests() {
  bridgeStarted = false
  clearReconnectTimer()
  closeActivePort()
  reconnectTimer = null
  bridgePortPath = process.platform === "win32" ? "COM3" : "/dev/ttyUSB0"
  bridgeBaudRate = DEFAULT_BAUD_RATE
  bridgeForwardUrl = DEFAULT_FORWARD_URL
  lastMessageReceivedAt = null
  serialDependencies = { ...defaultSerialDependencies }
  timerApi = { ...defaultTimerApi }
}

module.exports = {
  startSerialBridge,
  parseSerialTelemetryLine,
  getSerialBridgeStatus,
  resolveReconnectDelayMs,
  __setSerialBridgeTestDependencies: setSerialBridgeTestDependencies,
  __resetSerialBridgeForTests: resetSerialBridgeForTests,
}
