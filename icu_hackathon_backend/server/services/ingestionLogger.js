const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.resolve(__dirname, "../logs");
const INGESTION_ERROR_LOG = path.join(LOGS_DIR, "ingestion-errors.log");

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "Unknown ingestion error");
}

function toErrorStack(error) {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  return "";
}

function appendErrorLine(line) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFile(INGESTION_ERROR_LOG, `${line}\n`, () => {
      // No-op: ingestion logging should never block runtime paths.
    });
  } catch {
    // No-op: keep runtime healthy even if file logging fails.
  }
}

function logIngestionError(source, stage, error, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    source: String(source || "unknown"),
    stage: String(stage || "unknown"),
    message: toErrorMessage(error),
    stack: toErrorStack(error),
    context,
  };

  console.error(`[Ingestion][${entry.source}:${entry.stage}] ${entry.message}`, context);

  try {
    appendErrorLine(JSON.stringify(entry));
  } catch {
    // No-op: serialization failure should not impact ingestion execution.
  }
}

module.exports = {
  INGESTION_ERROR_LOG,
  logIngestionError,
};
