from pathlib import Path
import importlib
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

app = importlib.import_module("icu_backend.main").app


if __name__ == "__main__":
    settings = app.config["SETTINGS"]
    app.run(host=settings.app_host, port=settings.app_port, debug=settings.debug)
