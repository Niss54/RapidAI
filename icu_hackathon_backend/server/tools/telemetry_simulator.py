import json
import random
import time
from urllib import request

SERVER_URL = "http://localhost:4000/telemetry/update"
PATIENT_IDS = ["201", "202", "203", "204", "205"]


def post(payload: dict) -> None:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        SERVER_URL,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req, timeout=8) as resp:
        body = resp.read().decode("utf-8")
        print(resp.status, body)


if __name__ == "__main__":
    print("Starting telemetry simulator...")
    while True:
        pid = random.choice(PATIENT_IDS)
        payload = {
            "patientId": pid,
            "heartRate": random.randint(70, 135),
            "spo2": random.randint(80, 99),
            "temperature": round(random.uniform(97.0, 103.0), 1),
            "bloodPressure": f"{random.randint(90, 155)}/{random.randint(55, 98)}",
        }
        post(payload)
        time.sleep(5)
