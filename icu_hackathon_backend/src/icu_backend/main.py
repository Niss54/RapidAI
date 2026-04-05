from icu_backend.app import create_app

app = create_app()


if __name__ == "__main__":
    settings = app.config["SETTINGS"]
    app.run(host=settings.app_host, port=settings.app_port, debug=settings.debug)
