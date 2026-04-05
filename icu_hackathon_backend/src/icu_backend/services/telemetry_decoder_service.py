import string
import struct
import threading
import time
from typing import Any


class TelemetryDecoderService:
    """Decodes incoming telemetry from plain observations or hexadecimal payloads."""

    PHYSIO_ID_MAP = {
        16770: "HR",
        18466: "HR",
        18949: "SBP",
        18950: "DBP",
        18951: "MAP",
        18963: "MAP",
        19272: "TEMP",
        19384: "SpO2",
        61669: "HR",
    }

    def __init__(self, fragment_ttl_seconds: int = 30):
        self.fragment_ttl_seconds = fragment_ttl_seconds
        self._fragment_buffer: dict[str, dict[str, Any]] = {}
        self._lock = threading.RLock()

    def decode(self, payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
        """
        Returns (observations, warnings).

        Expected payload styles:
        1) observations: [{"signal": "HR", "value": 90.0, "timestamp": ...}, ...]
        2) hex_payload: "..."
        3) fragment: {"packet_id": "p1", "index": 0, "total": 2, "hex_payload": "..."}
        """
        warnings: list[str] = []
        fallback_timestamp = float(payload.get("timestamp", time.time()))

        if isinstance(payload.get("observations"), list):
            observations = self._decode_observations(payload["observations"], fallback_timestamp)
            return observations, warnings

        fragment = payload.get("fragment")
        if isinstance(fragment, dict):
            assembled = self._consume_fragment(fragment)
            if assembled is None:
                return [], ["Fragment buffered; waiting for remaining fragments"]
            payload = {**payload, "hex_payload": assembled}

        hex_payload = payload.get("hex_payload")
        if isinstance(hex_payload, str) and hex_payload.strip():
            observations = self._decode_hex_payload(hex_payload, fallback_timestamp)
            if not observations:
                warnings.append("No supported vital-sign identifiers decoded from hex payload")
            return observations, warnings

        warnings.append("No decodable telemetry data found in request")
        return [], warnings

    def _decode_observations(
        self, observations: list[dict[str, Any]], fallback_timestamp: float
    ) -> list[dict[str, Any]]:
        decoded: list[dict[str, Any]] = []
        for item in observations:
            signal = str(
                item.get("signal")
                or item.get("category")
                or item.get("signal_name")
                or ""
            ).strip()
            if not signal:
                continue

            raw_value = item.get("value", item.get("signal_value"))
            value = self._as_float(raw_value)
            if value is None:
                continue

            timestamp = self._as_float(item.get("timestamp", item.get("time_recorded")))
            decoded.append(
                {
                    "signal": signal,
                    "value": value,
                    "timestamp": timestamp if timestamp is not None else fallback_timestamp,
                    "source_signal": signal,
                }
            )
        return decoded

    def _decode_hex_payload(
        self, hex_payload: str, fallback_timestamp: float
    ) -> list[dict[str, Any]]:
        clean = "".join(ch for ch in hex_payload if ch in string.hexdigits)
        if len(clean) < 12:
            return []
        if len(clean) % 2 != 0:
            clean = clean[:-1]

        packet = bytes.fromhex(clean)
        decoded: list[dict[str, Any]] = []

        for offset in range(0, len(packet) - 5, 6):
            p_id = int.from_bytes(packet[offset : offset + 2], byteorder="big", signed=False)
            signal = self.PHYSIO_ID_MAP.get(p_id)
            if not signal:
                continue

            value_bytes = packet[offset + 2 : offset + 6]
            value = self._decode_ieee11073_float(value_bytes)
            decoded.append(
                {
                    "signal": signal,
                    "value": value,
                    "timestamp": fallback_timestamp,
                    "source_signal": f"physio_id_{p_id}",
                }
            )

        return decoded

    def _consume_fragment(self, fragment: dict[str, Any]) -> str | None:
        packet_id = str(fragment.get("packet_id", "")).strip()
        total = int(fragment.get("total", 0))
        index = int(fragment.get("index", -1))
        data = str(fragment.get("hex_payload", "")).strip()

        if not packet_id or total <= 0 or index < 0 or index >= total or not data:
            return None

        now = time.time()
        with self._lock:
            self._cleanup_locked(now)
            entry = self._fragment_buffer.setdefault(
                packet_id,
                {"created_at": now, "total": total, "parts": {}},
            )
            entry["parts"][index] = data

            if len(entry["parts"]) != entry["total"]:
                return None

            combined = "".join(entry["parts"][i] for i in range(entry["total"]))
            del self._fragment_buffer[packet_id]
            return combined

    def _cleanup_locked(self, now: float) -> None:
        stale_ids = [
            packet_id
            for packet_id, entry in self._fragment_buffer.items()
            if now - entry.get("created_at", now) > self.fragment_ttl_seconds
        ]
        for packet_id in stale_ids:
            del self._fragment_buffer[packet_id]

    @staticmethod
    def _as_float(value: Any) -> float | None:
        try:
            parsed = float(value)
            if parsed != parsed:
                return None
            return parsed
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _decode_ieee11073_float(raw: bytes) -> float:
        exponent = struct.unpack("!b", raw[:1])[0]

        if (raw[1] >> 7) == 0:
            mantissa = struct.unpack("!i", b"\x00" + raw[1:4])[0]
        else:
            expanded = struct.unpack("!i", b"\x80" + raw[1:4])[0]
            mask = ~struct.unpack("!i", b"\x00\x80\x00\x00")[0]
            mantissa = expanded & mask

        return float(mantissa * (10**exponent))
