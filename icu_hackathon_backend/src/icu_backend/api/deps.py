from flask import current_app

from icu_backend.services import ServiceContainer


def get_services() -> ServiceContainer:
    return current_app.extensions["services"]
