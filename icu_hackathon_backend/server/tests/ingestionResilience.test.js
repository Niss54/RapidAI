const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const hl7IngestionService = require("../services/hl7IngestionService");
const serialBridge = require("../services/serialBridge");

test.afterEach(() => {
  hl7IngestionService.__resetHl7IngestionServiceForTests();
  serialBridge.__resetSerialBridgeForTests();
});

test("HL7 service schedules restart when listener closes", () => {
  const netServer = new EventEmitter();
  const timerCalls = [];

  const fakeTcpApp = {
    use() {
      // Middleware registration is irrelevant for this lifecycle test.
    },
    start() {
      // Start succeeds so lifecycle handlers attach.
    },
    stop() {
      // No-op for tests.
    },
    server: {
      server: netServer,
    },
  };

  hl7IngestionService.__setHl7IngestionTestDependencies({
    hl7Adapter: {
      tcp() {
        return fakeTcpApp;
      },
    },
    timerApi: {
      setTimeout(callback, delay) {
        timerCalls.push({ callback, delay });
        return { id: timerCalls.length };
      },
      clearTimeout() {
        // No-op for tests.
      },
    },
  });

  const startStatus = hl7IngestionService.startHl7IngestionService({
    port: 7777,
    forwardUrl: "http://127.0.0.1:4000/telemetry/update",
    restartDelayMs: 4321,
  });

  assert.equal(startStatus.running, true);

  netServer.emit("close");

  const status = hl7IngestionService.getHl7IngestionStatus();
  assert.equal(status.running, false);
  assert.equal(status.restartScheduled, true);
  assert.equal(timerCalls.length, 1);
  assert.equal(timerCalls[0].delay, 4321);
});

test("serial bridge schedules reconnect with 5000ms floor on open failure", () => {
  const timerCalls = [];

  class FakeReadlineParser extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = options;
    }
  }

  class FakeSerialPort extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = options;
      this.isOpen = false;
    }

    pipe(parser) {
      this.parser = parser;
      return parser;
    }

    open(callback) {
      callback(new Error("open failed"));
    }

    close() {
      this.isOpen = false;
      this.emit("close");
    }
  }

  serialBridge.__setSerialBridgeTestDependencies({
    SerialPort: FakeSerialPort,
    ReadlineParser: FakeReadlineParser,
    timerApi: {
      setTimeout(callback, delay) {
        timerCalls.push({ callback, delay });
        return { id: timerCalls.length };
      },
      clearTimeout() {
        // No-op for tests.
      },
    },
  });

  const status = serialBridge.startSerialBridge({
    port: "COM9",
    reconnectDelayMs: 1200,
    forwardUrl: "http://127.0.0.1:4000/telemetry/update",
  });

  assert.equal(status.running, true);
  assert.equal(timerCalls.length, 1);
  assert.equal(timerCalls[0].delay, 5000);
}
);