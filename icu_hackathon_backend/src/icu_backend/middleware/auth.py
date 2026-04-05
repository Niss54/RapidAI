from flask import Request, abort


EXEMPT_PATHS = {"/health"}


def enforce_api_key(request: Request, configured_api_key: str, api_prefix: str) -> None:
    if not configured_api_key:
        return

    path = request.path
    if path in EXEMPT_PATHS:
        return
    if not path.startswith(api_prefix):
        return

    provided = request.headers.get("X-API-Key", "").strip()
    if provided != configured_api_key:
        abort(401, description="Invalid API key")
