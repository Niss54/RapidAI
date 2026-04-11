const axios = require("axios");
const hl7 = require("simple-hl7");

const HL7_HOST = String(process.env.HL7_HOST || "127.0.0.1").trim();
const HL7_PORT = Number(process.env.HL7_TCP_PORT || 7777);
const SERVER_PORT = Number(process.env.SERVER_PORT || 4000);
const SERVER_BASE_URL = String(
  process.env.SERVER_BASE_URL || `http://127.0.0.1:${SERVER_PORT}`
).trim();
const SUMMARY_URL = `${SERVER_BASE_URL.replace(/\/+$/, "")}/icu/summary`;

const TARGET_PATIENT_ID = String(process.env.TEST_HL7_PATIENT_ID || "205").trim();

const EXPECTED_VITALS = {
  heartRate: 110,
  spo2: 89,
  temperature: 38.2,
  bloodPressure: "120/80",
};

const HL7_MESSAGE_TEXT = [
  "MSH|^~\\&|Monitor|ICU|Server|Hospital|20260411||ORU^R01|123|P|2.4",
  "PID|||205",
  "OBX|1|NM|HR||110",
  "OBX|2|NM|SpO2||89",
  "OBX|3|NM|Temp||38.2",
  "OBX|4|NM|BP||120/80",
].join("\r");

function buildTestMessage() {
  const parser = new hl7.Parser({ segmentSeperator: "\r" });
  return parser.parse(HL7_MESSAGE_TEXT);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractAckCode(ack) {
  try {
    const msa = ack?.getSegment?.("MSA");
    return String(msa?.getField?.(1) || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

function sendTestMessage(message) {
  return new Promise((resolve, reject) => {
    const client = hl7.Server.createTcpClient({
      host: HL7_HOST,
      port: HL7_PORT,
      keepalive: false,
    });

    client.send(message, (error, ack) => {
      try {
        client.close();
      } catch {
        // No-op if socket already closed.
      }

      if (error) {
        reject(error);
        return;
      }

      resolve(ack);
    });
  });
}

function vitalsMatch(patient) {
  if (!patient) {
    return false;
  }

  const heartRate = Number(patient.heartRate);
  const spo2 = Number(patient.spo2);
  const temperature = Number(patient.temperature);
  const bloodPressure = String(patient.bloodPressure || "").trim();

  return (
    heartRate === EXPECTED_VITALS.heartRate &&
    spo2 === EXPECTED_VITALS.spo2 &&
    Math.abs(temperature - EXPECTED_VITALS.temperature) < 0.15 &&
    bloodPressure === EXPECTED_VITALS.bloodPressure
  );
}

async function confirmForwarded(maxAttempts = 12, delayMs = 750) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await axios.get(SUMMARY_URL, { timeout: 5000 });
      const patients = Array.isArray(response?.data?.patients)
        ? response.data.patients
        : [];

      const targetPatient = patients.find(
        (row) => String(row?.patientId || "").trim() === TARGET_PATIENT_ID
      );

      if (vitalsMatch(targetPatient)) {
        return targetPatient;
      }
    } catch {
      // Keep retrying until timeout window is reached.
    }

    await sleep(delayMs);
  }

  return null;
}

async function main() {
  console.log(
    `[HL7 Test] Sending ORU^R01 test message to ${HL7_HOST}:${HL7_PORT}`
  );

  const message = buildTestMessage();
  const ack = await sendTestMessage(message);
  const ackCode = extractAckCode(ack);

  if (ackCode) {
    console.log(`[HL7 Test] ACK received: ${ackCode}`);
  } else {
    console.log("[HL7 Test] ACK received");
  }

  if (ackCode && ackCode !== "AA") {
    throw new Error(`HL7 listener returned non-success ACK: ${ackCode}`);
  }

  const confirmedPatient = await confirmForwarded();
  if (!confirmedPatient) {
    throw new Error(
      "Message sent but forwarding could not be confirmed via /icu/summary"
    );
  }

  console.log(
    `[HL7 Test] Message forwarded successfully for patient ${confirmedPatient.patientId}`
  );
  console.log(
    `[HL7 Test] Vitals -> HR:${confirmedPatient.heartRate}, SpO2:${confirmedPatient.spo2}, Temp:${confirmedPatient.temperature}, BP:${confirmedPatient.bloodPressure}`
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    console.error(`[HL7 Test] Failed: ${message}`);
    process.exit(1);
  });
